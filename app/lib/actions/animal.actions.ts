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
  AnimalSize,
  ApplicationStatus,
  IntakeType,
} from "@/prisma/generated/enums";
import { buildLocationChangeSummary } from "../utils/location-activity";
import { ConflictError, NotFoundError } from "../utils/errors";
import { del } from "@vercel/blob";
import { isDemo } from "@/lib/flags";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// Shared by create and update — the "" -> null conversion for every nullable
// column either action writes. Not every field applies to both actions
// (sourcePartnerId/surrenderingPersonId only exist on AnimalEditFormInput's
// counterpart, CreateAnimalFormInput); unused fields just come through as
// undefined -> null, which is harmless since the caller never reads them.
const toAnimalData = (data: {
  size?: AnimalSize | "";
  currentUnitId?: string;
  sourcePartnerId?: string;
  surrenderingPersonId?: string;
  foundAddress?: string;
  foundCity?: string;
  foundState?: string;
  notes?: string;
  microchipNumber?: string;
  isSpayedNeutered: boolean;
  description?: string;
  city?: string;
  state?: string;
}) => ({
  size: data.size || null,
  currentUnitId: data.currentUnitId || null,
  sourcePartnerId: data.sourcePartnerId || null,
  surrenderingPersonId: data.surrenderingPersonId || null,
  foundAddress: data.foundAddress || null,
  foundCity: data.foundCity || null,
  foundState: data.foundState || null,
  notes: data.notes || null,
  microchipNumber: data.microchipNumber || null,
  // Non-nullable with a default — no "" -> null treatment, unlike the fields
  // above; passed straight through.
  isSpayedNeutered: data.isSpayedNeutered,
  description: data.description || null,
  city: data.city || null,
  state: data.state || null,
});

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
    intakeType,
    intakeDate,
    weightGrams,
    heightCm,
    surrenderingPersonId,
  } = validatedFields.data;

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

  const mapped = toAnimalData(validatedFields.data);

  // Full color set = primary + additionals, de-duped in case the primary
  // also appears in the additional list.
  const allColorIds = Array.from(
    new Set([primaryColorId, ...additionalColorIds]),
  );

  try {
    await prisma.$transaction(async (tx) => {
      const speciesRecord = await tx.species.findUnique({
        where: { id: speciesId },
        select: { name: true },
      });

      if (!speciesRecord) {
        throw new Error("Invalid Species ID provided.");
      }

      // Guard: all submitted colors must exist and not be soft-deleted.
      const validColorCount = await tx.color.count({
        where: { id: { in: allColorIds }, deletedAt: null },
      });
      if (validColorCount !== allColorIds.length) {
        throw new Error("One or more selected colors are no longer available.");
      }

      // verify the chosen unit still exists and isn't
      // soft-deleted. Treat a stale/deleted unit as Unplaced rather than
      // erroring. Capacity is never enforced.
      let resolvedUnitId: string | null = null;
      let resolvedUnitLabel: {
        name: string;
        location: { name: string };
      } | null = null;
      if (mapped.currentUnitId) {
        const unit = await tx.unit.findFirst({
          where: { id: mapped.currentUnitId, deletedAt: null },
          select: {
            id: true,
            name: true,
            location: { select: { name: true } },
          },
        });
        resolvedUnitId = unit?.id ?? null;
        resolvedUnitLabel = unit
          ? { name: unit.name, location: unit.location }
          : null;
      }

      // Set publishedAt if listing status is PUBLISHED
      const publishedAt =
        listingStatus === AnimalListingStatus.PUBLISHED ? new Date() : null;

      const newAnimal = await tx.animal.create({
        data: {
          name: animalName,
          birthDate: estimatedBirthDate,
          sex: sex,
          size: mapped.size,
          description: mapped.description,
          // A fresh row has nothing to preserve, so null and undefined are
          // equivalent here — written directly now that these are real
          // nullable numbers rather than strings needing a truthy guard.
          currentWeightGrams: weightGrams,
          heightCm,
          healthStatus: healthStatus,
          listingStatus: listingStatus,
          publishedAt: publishedAt,
          microchipNumber: mapped.microchipNumber,
          isSpayedNeutered: mapped.isSpayedNeutered,
          city: mapped.city,
          state: mapped.state,
          currentUnit: resolvedUnitId
            ? { connect: { id: resolvedUnitId } }
            : undefined,
          species: { connect: { id: speciesId } },
          breeds: { connect: { id: breedId } },
          colors: { connect: allColorIds.map((id) => ({ id })) },
          primaryColor: { connect: { id: primaryColorId } },
        },
      });

      await tx.intake.create({
        data: {
          type: intakeType,
          intakeDate: intakeDate,
          notes: mapped.notes,
          animalId: newAnimal.id,
          staffMemberId: staffMemberId,
          sourcePartnerId:
            intakeType === IntakeType.TRANSFER_IN
              ? mapped.sourcePartnerId
              : undefined,
          surrenderingPersonId:
            intakeType === IntakeType.OWNER_SURRENDER
              ? mapped.surrenderingPersonId
              : undefined,
          foundAddress:
            intakeType === IntakeType.STRAY ? mapped.foundAddress : undefined,
          foundCity:
            intakeType === IntakeType.STRAY ? mapped.foundCity : undefined,
          foundState:
            intakeType === IntakeType.STRAY ? mapped.foundState : undefined,
        },
      });

      // A dated first data point with real provenance, rather than a bare
      // number with no history. See VitalsLog and recomputeCurrentWeight in
      // animal-vitals.actions.ts for the cache invariant this must respect —
      // safe to set currentWeightGrams directly here since this is the only
      // entry that will exist for this animal.
      if (weightGrams) {
        await tx.vitalsLog.create({
          data: {
            animalId: newAnimal.id,
            recordedById: staffMemberId,
            recordedAt: intakeDate,
            weightGrams,
          },
        });
      }

      const intakeSummaryBase = `Animal was admitted as ${intakeType
        .replace(/_/g, " ")
        .toLowerCase()}`;
      // Intake is not a relocation and must not emit its own LOCATION_CHANGE
      // (that would double-log). If a unit was chosen at intake, note the
      // initial placement inline on this same summary instead.
      const intakeSummary = resolvedUnitLabel
        ? `${intakeSummaryBase}; placed in ${resolvedUnitLabel.location.name} · ${resolvedUnitLabel.name}.`
        : `${intakeSummaryBase}.`;

      await tx.animalActivityLog.create({
        data: {
          animalId: newAnimal.id,
          activityType: AnimalActivityType.INTAKE_PROCESSED,
          changedById: staffMemberId,
          changeSummary: intakeSummary,
        },
      });

      // Log status change if published
      if (listingStatus === AnimalListingStatus.PUBLISHED) {
        await tx.animalActivityLog.create({
          data: {
            animalId: newAnimal.id,
            activityType: AnimalActivityType.STATUS_CHANGE,
            changedById: staffMemberId,
            changeSummary: `Listing status changed to PUBLISHED.`,
          },
        });
      }
    });
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

  // This guard prevents archiving from the intake form.
  if (
    listingStatus === AnimalListingStatus.ARCHIVED ||
    listingStatus === AnimalListingStatus.PENDING_ADOPTION
  ) {
    return {
      ok: false,
      message:
        "Invalid Action: This status can only be set via the outcome or application approval process.",
    };
  }

  const mapped = toAnimalData(validatedFields.data);

  // Full color set = primary + additionals, de-duped in case the primary
  // also appears in the additional list.
  const allColorIds = Array.from(
    new Set([primaryColorId, ...additionalColorIds]),
  );

  try {
    await prisma.$transaction(async (tx) => {
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
        const approvedApplication = await tx.adoptionApplication.findFirst({
          where: {
            animalId: validatedAnimalId,
            status: ApplicationStatus.APPROVED,
          },
        });

        if (approvedApplication) {
          throw new ConflictError(
            "Cannot change status. This animal has an approved adoption application. Please reject or withdraw the application first."
          );
        }
      }

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
      // erroring. Capacity is never enforced.
      let resolvedUnitId: string | null = null;
      let resolvedUnitLabel: {
        name: string;
        location: { name: string };
      } | null = null;
      if (mapped.currentUnitId) {
        const unit = await tx.unit.findFirst({
          where: { id: mapped.currentUnitId, deletedAt: null },
          select: {
            id: true,
            name: true,
            location: { select: { name: true } },
          },
        });
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
          city: mapped.city,
          state: mapped.state,
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

const _togglePetLike = async (
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

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_animalId: {
          userId: personId,
          animalId: validatedAnimalId,
        },
      },
    });

    if (existingLike) {
      // Unlike is always allowed, regardless of listing status, so users can
      // clear pets from their favorites even after the pet becomes unavailable.
      await prisma.like.delete({
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
      // Creating a new like is only allowed for available pets. This guards
      // against stale pages or crafted requests trying to like an archived pet.
      const isLikeableStatus =
        pet.listingStatus === "PUBLISHED" ||
        pet.listingStatus === "PENDING_ADOPTION";
      if (!isLikeableStatus) {
        return {
          success: false,
          message:
            "This pet is not available for interaction at its current status.",
        };
      }

      await prisma.like.create({
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
      `Database error toggling like for pet ${validatedAnimalId} and user ${personId}:`,
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

export const togglePetLike = withAuthenticatedUser(_togglePetLike);