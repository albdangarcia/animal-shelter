"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  CreateAnimalFormSchema,
  AnimalEditFormSchema,
  type CreateAnimalFormInput,
  type AnimalEditFormInput,
} from "../zod-schemas/animal.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  IntakeType,
} from "@/prisma/generated/enums";
import { buildLocationChangeSummary } from "../utils/location-activity";
import { ConflictError, NotFoundError } from "../utils/errors";
import { findLiveUnitForPlacement } from "../services/unit-housing";
import { recordAnimalCreation } from "../services/animal-creation";
import { toAnimalData } from "../utils/animal-data";
import { del } from "@vercel/blob";
import { isDemo } from "@/lib/flags";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatuses,
  lockAnimal,
} from "../data/application-status.data";
import { checkFirstIntakeDay } from "../data/animal-timeline.data";

const _createAnimal = async (
  user: SessionUser,
  values: CreateAnimalFormInput,
): Promise<FormResult<CreateAnimalFormInput>> => {
  const staffMemberId = user.personId;

  if (!staffMemberId) {
    return {
      ok: false,
      message:
        "Authentication Error: Your user account is not associated with a person record.",
    };
  }

  const validatedFields = CreateAnimalFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create intake record.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<CreateAnimalFormInput>,
    };
  }

  const { intakeType, intakeDate, surrenderingPersonId } =
    validatedFields.data;

  if (intakeType === IntakeType.OWNER_SURRENDER) {
    const parsedPersonId = cuidSchema.safeParse(surrenderingPersonId);
    if (!parsedPersonId.success) {
      return {
        ok: false,
        message: "Missing or invalid fields. Failed to create intake record.",
        fieldErrors: {
          surrenderingPersonId: ["A surrendering person is required."],
        } as FieldErrors<CreateAnimalFormInput>,
      };
    }
  }

  try {
    // The picker disables future days, but only in the browser, and against
    // the day the page was rendered on. The animal has no other events yet,
    // so this is the only part of the timeline check that can apply. It reads
    // the shelter's settings, so it sits inside the try with the writes.
    const futureDay = await checkFirstIntakeDay(intakeDate);
    if (futureDay) {
      return {
        ok: false,
        message: futureDay,
        fieldErrors: { intakeDate: [futureDay] },
      };
    }

    await prisma.$transaction((tx) =>
      recordAnimalCreation(tx, validatedFields.data, staffMemberId),
    );
  } catch (error) {
    console.error("Database Error creating intake record:", error);
    return {
      ok: false,
      message: "Database Error: Failed to create intake record.",
    };
  }

  revalidatePath("/dashboard/animals");

  return {
    ok: true,
    message: "Animal intake created successfully.",
    redirectTo: "/dashboard/animals",
  };
};

const _updateAnimal = async (
  user: SessionUser,
  animalId: string,
  values: AnimalEditFormInput,
): Promise<FormResult<AnimalEditFormInput>> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedId.data;
  const staffMemberId = user.personId;

  const validatedFields = AnimalEditFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update animal.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<AnimalEditFormInput>,
    };
  }

  const {
    animalName,
    estimatedBirthDate,
    sex,
    healthStatus,
    listingStatus,
    species: speciesId,
    breed: breedId,
    primaryColor: primaryColorId,
    additionalColors: additionalColorIds,
    heightCm,
  } = validatedFields.data;

  // The listing status is immutable from this form for ARCHIVED and
  // PENDING_ADOPTION animals, but the check lives inside the transaction now
  // (see below) so it can compare the submitted value against the current one.
  // The edit form disables the status select for those two statuses and
  // re-submits the unchanged value, so guarding on the submitted value alone
  // rejected every ordinary save of an archived or pending-adoption record.

  const mapped = toAnimalData(validatedFields.data);

  // Full color set = primary + additionals, de-duped in case the primary
  // also appears in the additional list.
  const allColorIds = Array.from(
    new Set([primaryColorId, ...additionalColorIds]),
  );

  try {
    await prisma.$transaction(async (tx) => {
      // The update below writes the listing status back whether or not it
      // changed, so everything read here has to still be true when it does.
      // Recording an outcome archives the animal behind this same lock; read
      // without it, an outcome committing in between would be overwritten by
      // the status this form loaded before it, putting an animal that has
      // left back on the list.
      await lockAnimal(tx, validatedAnimalId);
      const currentAnimal = await tx.animal.findUnique({
        where: { id: validatedAnimalId },
        select: {
          listingStatus: true,
          publishedAt: true,
          currentUnitId: true,
          currentUnit: {
            select: { name: true, location: { select: { name: true } } },
          },
        },
      });

      if (!currentAnimal) {
        throw new NotFoundError("Animal not found.");
      }

      // One state check for the listing status. Staff may edit the descriptive
      // fields of an archived or pending-adoption record; the status itself is
      // immutable from this form. Because the form re-submits the current
      // (disabled) value, an unchanged status is the ordinary edit case and
      // must pass through untouched — only a real transition is rejected.
      if (listingStatus !== currentAnimal.listingStatus) {
        if (currentAnimal.listingStatus === AnimalListingStatus.ARCHIVED) {
          throw new ConflictError(
            "This animal is archived. To make it available again, please use the re-intake process."
          );
        }

        const isChangingToAvailable =
          listingStatus === AnimalListingStatus.PUBLISHED ||
          listingStatus === AnimalListingStatus.DRAFT;

        if (
          currentAnimal.listingStatus === AnimalListingStatus.PENDING_ADOPTION &&
          isChangingToAvailable
        ) {
          // Approved as the application effectively is: one approved during
          // an earlier stay, and adopted or closed by that stay's outcome,
          // still stores APPROVED and must not hold this animal. Derived
          // behind the animal lock taken above.
          const approvedApplications = await tx.adoptionApplication.findMany({
            where: {
              animalId: validatedAnimalId,
              status: ApplicationStatus.APPROVED,
            },
            select: DERIVATION_APPLICATION_SELECT,
          });
          const statuses = await effectiveApplicationStatuses(
            approvedApplications,
            tx,
          );

          if ([...statuses.values()].includes(ApplicationStatus.APPROVED)) {
            throw new ConflictError(
              "Cannot change status. This animal has an approved adoption application. Please reject or withdraw the application first."
            );
          }
        } else if (
          listingStatus === AnimalListingStatus.ARCHIVED ||
          listingStatus === AnimalListingStatus.PENDING_ADOPTION
        ) {
          // A real transition into a status this form doesn't own. The message
          // is accurate now that it only fires on an actual change.
          throw new ConflictError(
            "Invalid Action: This status can only be set via the outcome or application approval process."
          );
        }
      }

      const isArchived =
        currentAnimal.listingStatus === AnimalListingStatus.ARCHIVED;

      const speciesRecord = await tx.species.findUnique({
        where: { id: speciesId },
        select: { name: true },
      });

      if (!speciesRecord) {
        throw new NotFoundError("The specified species does not exist.");
      }

      // Guard: all submitted colors must exist and not be soft-deleted.
      const validColorCount = await tx.color.count({
        where: { id: { in: allColorIds }, deletedAt: null },
      });
      if (validColorCount !== allColorIds.length) {
        throw new ConflictError(
          "One or more selected colors are no longer available. Please refresh and try again.",
        );
      }

      // verify the chosen unit still exists and isn't
      // soft-deleted. Treat a stale/deleted unit as Unplaced rather than
      // erroring. Capacity is never enforced. Read behind the unit's lock, as
      // on create.
      let resolvedUnitId: string | null = null;
      let resolvedUnitLabel: {
        name: string;
        location: { name: string };
      } | null = null;
      // An archived animal has left the shelter and cannot occupy a unit. The
      // form disables the Location/Unit cascade for archived animals; don't
      // trust the client — coerce to Unplaced here regardless of what was
      // submitted.
      if (mapped.currentUnitId && !isArchived) {
        const unit = await findLiveUnitForPlacement(tx, mapped.currentUnitId);
        resolvedUnitId = unit?.id ?? null;
        resolvedUnitLabel = unit
          ? { name: unit.name, location: unit.location }
          : null;
      }

      let publishedAt = currentAnimal.publishedAt;
      if (
        listingStatus === AnimalListingStatus.PUBLISHED &&
        !currentAnimal.publishedAt
      ) {
        publishedAt = new Date();
      }

      await tx.animal.update({
        where: { id: validatedAnimalId },
        data: {
          name: animalName,
          birthDate: estimatedBirthDate,
          sex: sex,
          size: mapped.size,
          description: mapped.description,
          // null genuinely clears the column now — a cleared field arrives
          // as null (never ""), so no more "" ? undefined : heightCm guard
          // that silently left a stale value in place.
          heightCm,
          healthStatus: healthStatus,
          listingStatus: listingStatus,
          publishedAt: publishedAt,
          microchipNumber: mapped.microchipNumber,
          isSpayedNeutered: mapped.isSpayedNeutered,
          currentUnit: resolvedUnitId
            ? { connect: { id: resolvedUnitId } }
            : { disconnect: true },
          species: { connect: { id: speciesId } },
          breeds: { set: [{ id: breedId }] },
          colors: { set: allColorIds.map((id) => ({ id })) },
          primaryColor: { connect: { id: primaryColorId } },
        },
      });

      if (currentAnimal.listingStatus !== listingStatus && staffMemberId) {
        await tx.animalActivityLog.create({
          data: {
            animalId: validatedAnimalId,
            activityType: AnimalActivityType.STATUS_CHANGE,
            changedById: staffMemberId,
            changeSummary: `Listing status changed from ${currentAnimal.listingStatus} to ${listingStatus}.`,
          },
        });
      }

      // Log a relocation only when the unit actually changed. The edit action
      // writes no generic FIELD_UPDATE, so LOCATION_CHANGE is purely additive.
      if (currentAnimal.currentUnitId !== resolvedUnitId && staffMemberId) {
        await tx.animalActivityLog.create({
          data: {
            animalId: validatedAnimalId,
            activityType: AnimalActivityType.LOCATION_CHANGE,
            changedById: staffMemberId,
            changeSummary: buildLocationChangeSummary(
              currentAnimal.currentUnit,
              resolvedUnitLabel
            ),
          },
        });
      }
    });
  } catch (error) {
    console.error("Database Error updating animal:", error);
    if (error instanceof ConflictError || error instanceof NotFoundError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to update animal record.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);

  return {
    ok: true,
    message: "Animal updated successfully.",
    redirectTo: `/dashboard/animals/${validatedAnimalId}`,
  };
};

const _togglePetFavorite = async (
  user: SessionUser,
  animalId: string
): Promise<{ success: boolean; message: string }> => {
  const personId = user.personId;
  if (!personId) {
    return { success: false, message: "Access Denied." };
  }
  const parsedPetId = cuidSchema.safeParse(animalId);
  if (!parsedPetId.success) {
    return { success: false, message: "Invalid Pet ID format." };
  }
  const validatedAnimalId = parsedPetId.data;

  try {
    const pet = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: { listingStatus: true },
    });

    if (!pet) {
      return { success: false, message: "Pet not found." };
    }

    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_animalId: {
          userId: personId,
          animalId: validatedAnimalId,
        },
      },
    });

    if (existingFavorite) {
      // Unfavoriting is always allowed, regardless of listing status, so users
      // can clear pets from their favorites even after the pet becomes unavailable.
      await prisma.favorite.delete({
        where: {
          userId_animalId: {
            userId: personId,
            animalId: validatedAnimalId,
          },
        },
      });

      revalidatePath("/pets");
      revalidatePath("/pets/favorites");
      revalidatePath(`/pets/${validatedAnimalId}`);

      return { success: true, message: "Removed from favorites." };
    } else {
      // Creating a new favorite is only allowed for available pets. This
      // guards against stale pages or crafted requests trying to favorite an
      // archived pet.
      const isFavoritableStatus =
        pet.listingStatus === "PUBLISHED" ||
        pet.listingStatus === "PENDING_ADOPTION";
      if (!isFavoritableStatus) {
        return {
          success: false,
          message:
            "This pet is not available for interaction at its current status.",
        };
      }

      await prisma.favorite.create({
        data: {
          userId: personId,
          animalId: validatedAnimalId,
        },
      });

      revalidatePath("/pets");
      revalidatePath("/pets/favorites");
      revalidatePath(`/pets/${validatedAnimalId}`);
      return { success: true, message: "Added to favorites!" };
    }
  } catch (error) {
    console.error(
      `Database error toggling favorite for pet ${validatedAnimalId} and user ${personId}:`,
      error
    );
    return {
      success: false,
      message: "An error occurred. Please try again.",
    };
  }
};

const _deleteAnimalImage = async (
  user: SessionUser,
  imageId: string,
  imageUrl: string,
  animalId: string
): Promise<{ success: boolean; message: string }> => {
  // Validate the image ID
  const parsedImageId = cuidSchema.safeParse(imageId);
  if (!parsedImageId.success) {
    return { success: false, message: 'Invalid Image ID.' };
  }

  try {
    // Delete the image file from Vercel Blob storage
    // In demo mode, skip blob deletion to preserve seed images
    if (!isDemo) {
      await del(imageUrl);
    }

    // Delete the image record from the database
    await prisma.animalImage.delete({
      where: { id: parsedImageId.data },
    });

    // Revalidate the photos tab plus the animal page, whose section cards render
    // whichever image is now [0].
    revalidatePath(`/dashboard/animals/${animalId}/photos`);
    revalidatePath(`/dashboard/animals/${animalId}`);

    return { success: true, message: 'Image deleted successfully.' };
  } catch (error) {
    console.error('Error deleting animal image:', error);
    return { success: false, message: 'Failed to delete image.' };
  }
};

const _reorderAnimalImages = async (
  user: SessionUser,
  animalId: string,
  orderedImageIds: string[]
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedId.data;

  const parsedImageIds = z
    .array(cuidSchema)
    .min(1, { error: "No photos were provided to reorder." })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "The photo order contains a duplicate.",
    })
    .safeParse(orderedImageIds);
  if (!parsedImageIds.success) {
    return { success: false, message: "Invalid photo order." };
  }
  const submittedIds = parsedImageIds.data;

  try {
    // The submitted array must be exactly this animal's current photo set —
    // same members, same count. This keeps the action from being a cross-animal
    // write primitive (an id belonging to another animal can never reach an
    // update), and it rejects a stale client view — a photo uploaded or deleted
    // in another tab since the page loaded — before a partial reorder can open
    // gaps or collide sortOrder values.
    const existingImages = await prisma.animalImage.findMany({
      where: { animalId: validatedAnimalId },
      select: { id: true },
    });
    const existingIds = new Set(existingImages.map((image) => image.id));
    const matchesCurrentSet =
      submittedIds.length === existingIds.size &&
      submittedIds.every((id) => existingIds.has(id));
    if (!matchesCurrentSet) {
      return {
        success: false,
        message:
          "This photo list is out of date — it may have changed in another tab. Refresh the page and try again.",
      };
    }

    // Animals have 1–3 photos in seed data and a handful in reality, so a short
    // loop of single-column updates in one transaction is fine — no CASE
    // expression or raw SQL. Each update is scoped by animalId as well as id.
    // Concurrent reorders are last-write-wins; no locking.
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < submittedIds.length; index++) {
        await tx.animalImage.update({
          where: { id: submittedIds[index], animalId: validatedAnimalId },
          data: { sortOrder: index },
        });
      }
    });
  } catch (error) {
    console.error("Database Error: Failed to reorder animal images.", error);
    return {
      success: false,
      message: "Database Error: Failed to update the photo order.",
    };
  }

  // The photos tab plus the animal page (its section cards render image [0]).
  // Reordering also changes the public thumbnail and gallery order, and the
  // homepage hero and browse strip both render the primary photo.
  revalidatePath(`/dashboard/animals/${validatedAnimalId}/photos`);
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);
  revalidatePath(`/pets/${validatedAnimalId}`);
  revalidatePath("/pets");
  revalidatePath("/");

  return { success: true, message: "Photo order updated." };
};

export const deleteAnimalImage = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_PHOTO_MANAGE)(_deleteAnimalImage)
);

export const reorderAnimalImages = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_PHOTO_MANAGE)(_reorderAnimalImages)
);

export const createAnimal = withAuthenticatedUser(
  RequirePermission(AppPermissions.INTAKE_MANAGE)(_createAnimal)
);

export const updateAnimal = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_INFO_MANAGE)(_updateAnimal)
);

export const toggleAnimalFavorite = withAuthenticatedUser(_togglePetFavorite);