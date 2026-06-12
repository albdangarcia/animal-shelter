"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { z } from "zod";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { AnimalFormSchema } from "../zod-schemas/animal.schemas";
import { AnimalFormState } from "../form-state-types";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  IntakeType,
  PersonType,
} from "@prisma/client";
import { getAnimalSize } from "../utils/animal-size";

import { ConflictError, NotFoundError } from "../utils/errors";
import { del } from "@vercel/blob";
import { isDemo } from "@/lib/flags";
const _createAnimal = async (
  user: SessionUser,
  prevState: AnimalFormState,
  formData: FormData
): Promise<AnimalFormState> => {
  const staffMemberId = user.personId;

  if (!staffMemberId) {
    return {
      message:
        "Authentication Error: Your user account is not associated with a person record.",
    };
  }

  const validatedFields = AnimalFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create intake record.",
    };
  }

  if (!validatedFields.data.intakeType || !validatedFields.data.intakeDate) {
    return {
      message:
        "Intake type and date are required to create a new animal record.",
    };
  }

  const {
    animalName,
    estimatedBirthDate,
    sex,
    healthStatus,
    listingStatus,
    microchipNumber,
    description,
    species: speciesId,
    breed: breedId,
    primaryColor: primaryColorId,
    intakeType,
    intakeDate,
    notes,
    sourcePartnerId,
    foundAddress,
    foundCity,
    foundState,
    surrenderingPersonName,
    surrenderingPersonPhone,
    weightKg,
    heightCm,
  } = validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      const speciesRecord = await tx.species.findUnique({
        where: { id: speciesId },
        select: { name: true },
      });

      if (!speciesRecord) {
        throw new Error("Invalid Species ID provided.");
      }

      const calculatedSize = getAnimalSize(
        speciesRecord.name,
        weightKg as number | null
      );

      let surrenderingPersonId: string | undefined;
      if (intakeType === IntakeType.OWNER_SURRENDER && surrenderingPersonName) {
        const person = await tx.person.create({
          data: {
            name: surrenderingPersonName,
            phone: surrenderingPersonPhone,
            type: PersonType.INDIVIDUAL,
          },
        });
        surrenderingPersonId = person.id;
      }

      // Set publishedAt if listing status is PUBLISHED
      const publishedAt =
        listingStatus === AnimalListingStatus.PUBLISHED ? new Date() : null;

      const newAnimal = await tx.animal.create({
        data: {
          name: animalName,
          birthDate: estimatedBirthDate,
          sex: sex,
          size: calculatedSize,
          description: description,
          weightKg: weightKg ? Number(weightKg) : undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
          healthStatus: healthStatus,
          listingStatus: listingStatus,
          publishedAt: publishedAt,
          microchipNumber: microchipNumber,
          city: validatedFields.data.foundCity || null,
          state: validatedFields.data.foundState || null,
          species: { connect: { id: speciesId } },
          breeds: { connect: { id: breedId } },
          colors: { connect: { id: primaryColorId } },
        },
      });

      await tx.intake.create({
        data: {
          type: intakeType,
          intakeDate: intakeDate,
          notes: notes,
          animalId: newAnimal.id,
          staffMemberId: staffMemberId,
          sourcePartnerId:
            intakeType === IntakeType.TRANSFER_IN ? sourcePartnerId : undefined,
          surrenderingPersonId:
            intakeType === IntakeType.OWNER_SURRENDER
              ? surrenderingPersonId
              : undefined,
          foundAddress:
            intakeType === IntakeType.STRAY ? foundAddress : undefined,
          foundCity: intakeType === IntakeType.STRAY ? foundCity : undefined,
          foundState: intakeType === IntakeType.STRAY ? foundState : undefined,
        },
      });

      await tx.animalActivityLog.create({
        data: {
          animalId: newAnimal.id,
          activityType: AnimalActivityType.INTAKE_PROCESSED,
          changedById: staffMemberId,
          changeSummary: `Animal was admitted as ${intakeType
            .replace(/_/g, " ")
            .toLowerCase()}.`,
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
      message: "Database Error: Failed to create intake record.",
    };
  }

  revalidatePath("/dashboard/animals");
  redirect("/dashboard/animals");
};

const _updateAnimal = async (
  user: SessionUser,
  animalId: string,
  prevState: AnimalFormState,
  formData: FormData
): Promise<AnimalFormState> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    return { message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedId.data;
  const staffMemberId = user.personId;

  const validatedFields = AnimalFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update animal.",
    };
  }

  const {
    animalName,
    estimatedBirthDate,
    sex,
    healthStatus,
    listingStatus,
    microchipNumber,
    description,
    species: speciesId,
    breed: breedId,
    primaryColor: primaryColorId,
    weightKg,
    heightCm,
    city,
    state,
  } = validatedFields.data;

  // This guard prevents archiving from the intake form.
  if (
    listingStatus === AnimalListingStatus.ARCHIVED ||
    listingStatus === AnimalListingStatus.PENDING_ADOPTION
  ) {
    return {
      message:
        "Invalid Action: This status can only be set via the outcome or application approval process.",
    };
  }

  const numericWeight = weightKg === "" ? undefined : weightKg;
  const numericHeight = heightCm === "" ? undefined : heightCm;

  try {
    await prisma.$transaction(async (tx) => {
      const currentAnimal = await tx.animal.findUnique({
        where: { id: validatedAnimalId },
        select: { listingStatus: true, publishedAt: true },
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

      const calculatedSize = getAnimalSize(
        speciesRecord.name,
        numericWeight as number | null
      );

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
          size: calculatedSize,
          description: description,
          weightKg: numericWeight,
          heightCm: numericHeight,
          healthStatus: healthStatus,
          listingStatus: listingStatus,
          publishedAt: publishedAt,
          microchipNumber: microchipNumber,
          city: city,
          state: state,
          species: { connect: { id: speciesId } },
          breeds: { set: [{ id: breedId }] },
          colors: { set: [{ id: primaryColorId }] },
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
    });
  } catch (error) {
    console.error("Database Error updating animal:", error);
    if (error instanceof ConflictError) {
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to update animal record.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);
  redirect(`/dashboard/animals/${validatedAnimalId}`);
};

const _togglePetLike = async (
  user: SessionUser,
  animalId: string
): Promise<{ success: boolean; message: string }> => {
  const personId = user.personId;
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

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_animalId: {
          userId: personId,
          animalId: validatedAnimalId,
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: {
          userId_animalId: {
            userId: personId,
            animalId: validatedAnimalId,
          },
        },
      });

      revalidatePath("/pets");
      revalidatePath(`/pets/${validatedAnimalId}`);

      return { success: true, message: "Removed from favorites." };
    } else {
      await prisma.like.create({
        data: {
          userId: personId,
          animalId: validatedAnimalId,
        },
      });

      revalidatePath("/pets");
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

const _addAnimalImage = async (
  user: SessionUser,
  animalId: string,
  imageUrl: string
): Promise<{ success: boolean; message: string }> => {
  const staffMemberId = user.personId;
  const parsedId = cuidSchema.safeParse(animalId);

  if (!parsedId.success) {
    return { success: false, message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedId.data;

  if (!imageUrl) {
    return { success: false, message: "Image URL is missing." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Create the AnimalImage record
      await tx.animalImage.create({
        data: {
          url: imageUrl,
          animalId: validatedAnimalId,
        },
      });

      // Log the activity
      if (staffMemberId) {
        await tx.animalActivityLog.create({
          data: {
            animalId: validatedAnimalId,
            activityType: AnimalActivityType.PHOTO_UPLOADED,
            changedById: staffMemberId,
            changeSummary: `A new photo was uploaded. URL: ${imageUrl}`,
          },
        });
      }
    });

    // Revalidate paths to show the new image immediately
    revalidatePath(`/dashboard/animals/${validatedAnimalId}`);
    revalidatePath(`/dashboard/animals/${validatedAnimalId}/documents`);

    return { success: true, message: "Image saved successfully!" };
  } catch (error) {
    console.error("Database Error: Failed to add animal image.", error);
    return {
      success: false,
      message: "Database Error: Failed to save the image.",
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

    // Revalidate the page to show the change immediately
    revalidatePath(`/dashboard/animals/${animalId}/documents`);

    return { success: true, message: 'Image deleted successfully.' };
  } catch (error) {
    console.error('Error deleting animal image:', error);
    return { success: false, message: 'Failed to delete image.' };
  }
};

export const deleteAnimalImage = withAuthenticatedUser(
  RequirePermission(Permissions.ANIMAL_DELETE_IMAGE)(_deleteAnimalImage)
);

export const createAnimal = withAuthenticatedUser(
  RequirePermission(Permissions.INTAKE_CREATE)(_createAnimal)
);

export const updateAnimal = withAuthenticatedUser(
  RequirePermission(Permissions.ANIMAL_UPDATE)(_updateAnimal)
);

export const togglePetLike = withAuthenticatedUser(_togglePetLike);
