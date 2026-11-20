"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  CreateAnimalFormSchema,
  AnimalEditFormSchema,
  hasIntakeMedical,
  type CreateAnimalFormInput,
  type AnimalEditFormInput,
} from "../zod-schemas/animal.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { can } from "../auth/can";
import { IntakeType } from "@/prisma/generated/enums";
import { ConflictError, NotFoundError } from "../utils/errors";
import { createAnimalFromForm } from "../services/animal-creation";
import { recordAnimalUpdate } from "../services/animal-update";
import { TaxonomyRefusal } from "../services/animal-taxonomy";
import {
  SKIP_PROTOCOL_REFUSAL,
  withProtocolHeadline,
} from "../services/medical-protocol-application";
import type { CareEpisodeOffer } from "../services/care-episode";
import {
  careEpisodeOfferPrompt,
  type CareEpisodeOfferPrompt,
} from "../data/care-episode-offer.data";
import {
  MedicalEntryRefusal,
  nameChipNumberHolder,
} from "../services/medical-entry";
import { deleteAnimalPhoto, setAnimalPhotoFocus } from "../services/animal-photos";
import { FOCUS_INVALID_MESSAGE, clampFocus } from "../utils/photo-focus";
import { animalPhotoStore } from "../storage/animal-photo-store";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

/**
 * Where the create form shows a refusal from the medical record. A chip's is
 * on its number; a spay's or neuter's on its own fields.
 */
const intakeMedicalField = (field: string | null | undefined) => {
  if (!field) return null;
  return field === "chipNumber"
    ? "intakeMedical.chipNumber"
    : `intakeMedical.altered.${field}`;
};

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

  const { intakeType, surrenderingPersonId, intakeMedical, applyProtocol } =
    validatedFields.data;

  // A chip or a spay or neuter recorded at intake goes on the medical record,
  // which only someone who may record medical care writes to. The form shows
  // the fields to them alone.
  if (
    hasIntakeMedical(intakeMedical) &&
    !can(user.role, AppPermissions.MEDICAL_MANAGE)
  ) {
    return {
      ok: false,
      message:
        "You don't have permission to record a microchip or a spay/neuter at intake.",
    };
  }

  // The protocol is the shelter's policy for every new animal; leaving it
  // out is a medical decision.
  if (!applyProtocol && !can(user.role, AppPermissions.MEDICAL_MANAGE)) {
    return { ok: false, message: SKIP_PROTOCOL_REFUSAL };
  }

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

  let created: Awaited<ReturnType<typeof createAnimalFromForm>>;
  try {
    // The day check reads the shelter's settings, so it sits inside the try
    // with the writes.
    created = await createAnimalFromForm(
      validatedFields.data,
      staffMemberId,
    );
    if ("refusal" in created) {
      return {
        ok: false,
        message: created.refusal,
        fieldErrors: { intakeDate: [created.refusal] },
      };
    }
  } catch (error) {
    // A species, breed or color deleted since the form was opened.
    if (error instanceof TaxonomyRefusal) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: {
          [error.field]: [error.message],
        } as FieldErrors<CreateAnimalFormInput>,
      };
    }
    // The medical record's refusal (a chip number already on another
    // animal's record, maybe taken at the same moment) rolled the intake
    // back. It goes under the intake's own field.
    const named = await nameChipNumberHolder(prisma, error);
    if (named instanceof MedicalEntryRefusal) {
      const field = intakeMedicalField(named.field);
      return {
        ok: false,
        message: named.message,
        fieldErrors: field
          ? ({ [field]: [named.message] } as FieldErrors<CreateAnimalFormInput>)
          : undefined,
      };
    }
    console.error("Database Error creating intake record:", error);
    return {
      ok: false,
      message: "Database Error: Failed to create intake record.",
    };
  }

  revalidatePath("/dashboard/animals");
  if (created.protocol) {
    revalidatePath(`/dashboard/animals/${created.animalId}`);
    revalidatePath("/dashboard/medical/due");
  }

  return {
    ok: true,
    message: withProtocolHeadline(
      "Animal intake created successfully.",
      created.protocol,
    ),
    redirectTo: "/dashboard/animals",
  };
};

/**
 * A changed unit into or out of a medical one offers a holder of
 * MEDICAL_MANAGE to open or close a care episode, which the form asks about
 * before it leaves. Only an offer: the save is the same either way.
 */
export type UpdateAnimalData = { careEpisodeOffer: CareEpisodeOfferPrompt | null };

const _updateAnimal = async (
  user: SessionUser,
  animalId: string,
  values: AnimalEditFormInput,
): Promise<FormResult<AnimalEditFormInput, UpdateAnimalData>> => {
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

  const offersCare = can(user.role, AppPermissions.MEDICAL_MANAGE);
  let offer: CareEpisodeOffer | null = null;
  try {
    offer = await prisma.$transaction((tx) =>
      recordAnimalUpdate(tx, {
        animalId: validatedAnimalId,
        values: validatedFields.data,
        staffMemberId,
        offersCare,
      }),
    );
  } catch (error) {
    if (error instanceof TaxonomyRefusal) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: {
          [error.field]: [error.message],
        } as FieldErrors<AnimalEditFormInput>,
      };
    }
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

  let careEpisodeOffer: CareEpisodeOfferPrompt | null = null;
  try {
    careEpisodeOffer = await careEpisodeOfferPrompt(offer);
  } catch (error) {
    // The save already succeeded; the offer is a convenience, so don't fail.
    console.error("Database Error reading the care episode offer:", error);
  }

  return {
    ok: true,
    message: "Animal updated successfully.",
    data: { careEpisodeOffer },
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
  animalId: string,
  expectedUrl: string
): Promise<{ success: boolean; message: string }> => {
  const parsedImageId = cuidSchema.safeParse(imageId);
  if (!parsedImageId.success) {
    return { success: false, message: 'Invalid Image ID.' };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { success: false, message: 'Invalid Animal ID.' };
  }
  const parsedExpectedUrl = z.string().min(1).safeParse(expectedUrl);
  if (!parsedExpectedUrl.success) {
    // A page loaded before the delete sent the photo's URL: reloading fixes it.
    return {
      success: false,
      message: 'No photo was named to delete. Reload the page and try again.',
    };
  }
  const staffMemberId = user.personId;
  if (!staffMemberId) {
    return {
      success: false,
      message: 'Your account is not associated with a person record.',
    };
  }
  const validatedAnimalId = parsedAnimalId.data;

  try {
    // The service deletes the row first, then its file, and only while the
    // photo is this animal's and still holds the URL staff saw: one replaced
    // or deleted in another tab meanwhile is refused.
    const result = await deleteAnimalPhoto(prisma, animalPhotoStore(), {
      animalId: validatedAnimalId,
      imageId: parsedImageId.data,
      expectedUrl: parsedExpectedUrl.data,
      staffMemberId,
    });
    if (!result.ok) {
      return { success: false, message: result.message };
    }
  } catch (error) {
    console.error('Error deleting animal image:', error);
    return { success: false, message: 'Failed to delete image.' };
  }

  // The photos tab plus the animal page (its section cards render image [0]).
  // Deleting the primary photo also changes the public listing and detail
  // page, and the homepage hero and browse strip render the primary photo.
  revalidatePath(`/dashboard/animals/${validatedAnimalId}/photos`);
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);
  revalidatePath(`/pets/${validatedAnimalId}`);
  revalidatePath("/pets");
  revalidatePath("/");

  return { success: true, message: 'Image deleted successfully.' };
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

const _setAnimalImageFocus = async (
  _user: SessionUser,
  animalId: string,
  imageId: string,
  expectedUrl: string,
  focusY: number | null
): Promise<{ success: boolean; message: string }> => {
  const parsed = z
    .object({
      animalId: cuidSchema,
      imageId: cuidSchema,
      expectedUrl: z.string().min(1),
      focusY: z.number().min(0).max(1).nullable(),
    })
    .safeParse({ animalId, imageId, expectedUrl, focusY });
  if (!parsed.success) {
    return { success: false, message: FOCUS_INVALID_MESSAGE };
  }
  const validatedAnimalId = parsed.data.animalId;

  try {
    // Only while the photo still holds the URL staff framed: one replaced or
    // deleted in another tab meanwhile is refused.
    const result = await setAnimalPhotoFocus(prisma, {
      animalId: validatedAnimalId,
      imageId: parsed.data.imageId,
      expectedUrl: parsed.data.expectedUrl,
      focusY: parsed.data.focusY === null ? null : clampFocus(parsed.data.focusY),
    });
    if (!result.ok) {
      return { success: false, message: result.message };
    }
  } catch (error) {
    console.error("Database Error: Failed to save a photo's framing.", error);
    return { success: false, message: "The framing wasn't saved. Try again." };
  }

  // Only the wide frames use it: the public listing (and the home page's
  // browse strip, which shows listing cards) and the animal's public page.
  // The Photos tab shows it in the framing dialog.
  revalidatePath(`/dashboard/animals/${validatedAnimalId}/photos`);
  revalidatePath(`/pets/${validatedAnimalId}`);
  revalidatePath("/pets");
  revalidatePath("/");

  return { success: true, message: "Framing saved." };
};

export const deleteAnimalImage = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_PHOTO_MANAGE)(_deleteAnimalImage)
);

export const reorderAnimalImages = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_PHOTO_MANAGE)(_reorderAnimalImages)
);

export const setAnimalImageFocus = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_PHOTO_MANAGE)(_setAnimalImageFocus)
);

export const createAnimal = withAuthenticatedUser(
  RequirePermission(AppPermissions.INTAKE_MANAGE)(_createAnimal)
);

export const updateAnimal = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_INFO_MANAGE)(_updateAnimal)
);

export const toggleAnimalFavorite = withAuthenticatedUser(_togglePetFavorite);