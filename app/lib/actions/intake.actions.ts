"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { Permissions } from "../auth/permissions";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
  PersonType,
} from "@prisma/client";
import { redirect } from "next/navigation";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { ReIntakeFormSchema } from "../zod-schemas/intake.schema";

export type IntakeFormState = {
  message?: string | null;
  errors?: {
    intakeType?: string[];
    intakeDate?: string[];
    healthStatus?: string[];
    sourcePartnerId?: string[];
    foundAddress?: string[];
    foundCity?: string[];
    foundState?: string[];
    surrenderingPersonName?: string[];
    surrenderingPersonPhone?: string[];
    notes?: string[];
  };
};

const _createReIntake = async (
  user: SessionUser,
  animalId: string,
  prevState: IntakeFormState,
  formData: FormData
): Promise<IntakeFormState> => {
  const staffMemberId = user.personId;

  if (!staffMemberId) {
    return {
      message:
        "Authentication Error: Your user account is not associated with a person record.",
    };
  }

  // Validate Animal ID
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedAnimalId.data;

  // Parse and validate form data
  const rawData = {
    intakeDate: formData.get("intakeDate") as string,
    intakeType: formData.get("intakeType") as string,
    healthStatus: formData.get("healthStatus") as string,
    notes: formData.get("notes") as string | undefined,
    sourcePartnerId: formData.get("sourcePartnerId") as string | undefined,
    foundAddress: formData.get("foundAddress") as string | undefined,
    foundCity: formData.get("foundCity") as string | undefined,
    foundState: formData.get("foundState") as string | undefined,
    surrenderingPersonName: formData.get("surrenderingPersonName") as
      | string
      | undefined,
    surrenderingPersonPhone: formData.get("surrenderingPersonPhone") as
      | string
      | undefined,
  };

  const validatedFields = ReIntakeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to process re-intake.",
    };
  }

  const {
    intakeDate,
    intakeType,
    healthStatus,
    notes,
    sourcePartnerId,
    foundAddress,
    foundCity,
    foundState,
    surrenderingPersonName,
    surrenderingPersonPhone,
  } = validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Atomically "reactivate" the animal in a SINGLE step
      const updateResult = await tx.animal.updateMany({
        where: {
          id: validatedAnimalId,
          listingStatus: AnimalListingStatus.ARCHIVED, // Check is part of the update
        },
        data: {
          listingStatus: AnimalListingStatus.DRAFT, // Always reset to Draft
          archiveReason: null, // Clear the old archive reason
          healthStatus: healthStatus, // Set the new health status from the form HERE
        },
      });

      // 2. Check if the update actually happened
      if (updateResult.count === 0) {
        throw new Error(
          "Cannot process re-intake: This animal is not currently archived or was just re-intaked."
        );
      }

      // Create surrendering person if needed
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

      // Create a new Intake record for this event
      await tx.intake.create({
        data: {
          intakeDate,
          type: intakeType,
          notes,
          animalId: validatedAnimalId,
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

      // Log this important event in the animal's history
      await tx.animalActivityLog.create({
        data: {
          animalId: validatedAnimalId,
          activityType: AnimalActivityType.INTAKE_PROCESSED,
          changedById: staffMemberId,
          changeSummary: `Animal was re-intaked as ${intakeType
            .replace(/_/g, " ")
            .toLowerCase()}.`,
        },
      });
    });
  } catch (error) {
    console.error("Database error during re-intake:", error);
    if (error instanceof Error) {
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to process re-intake.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);
  redirect(`/dashboard/animals/${validatedAnimalId}`);
};

export const createReIntake = withAuthenticatedUser(
  RequirePermission(Permissions.INTAKE_CREATE)(_createReIntake)
);
