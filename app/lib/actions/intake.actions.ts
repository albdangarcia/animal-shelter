"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { AppPermissions } from "../auth/permissions";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
} from "@/prisma/generated/enums";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  IntakeCorrectionFormSchema,
  ReIntakeFormSchema,
  type IntakeCorrectionFormInput,
  type ReIntakeFormInput,
} from "../zod-schemas/intake.schema";
import { ConflictError, NotFoundError } from "../utils/errors";
import {
  recordIntakeCorrection,
  toIntakeCorrectionValues,
  type IntakeCorrection,
} from "../services/intake-correction";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// "" -> null for the nullable columns Intake.create writes. Under rule 3 an
// untouched optional field arrives as "" rather than being omitted (the old
// FormData submit loop dropped it instead), so it must not be written into a
// nullable column as an empty string.
const toReIntakeData = (data: {
  notes?: string;
  sourcePartnerId?: string;
  foundAddress?: string;
  foundCity?: string;
  foundState?: string;
  surrenderingPersonId?: string;
}) => ({
  notes: data.notes || null,
  sourcePartnerId: data.sourcePartnerId || null,
  foundAddress: data.foundAddress || null,
  foundCity: data.foundCity || null,
  foundState: data.foundState || null,
  surrenderingPersonId: data.surrenderingPersonId || null,
});

const _createReIntake = async (
  user: SessionUser,
  animalId: string,
  values: ReIntakeFormInput,
): Promise<FormResult<ReIntakeFormInput>> => {
  const staffMemberId = user.personId;

  if (!staffMemberId) {
    return {
      ok: false,
      message:
        "Authentication Error: Your user account is not associated with a person record.",
    };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid Animal ID." };
  }
  const validatedAnimalId = parsedAnimalId.data;

  const validatedFields = ReIntakeFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to process re-intake.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ReIntakeFormInput>,
    };
  }

  const { intakeDate, intakeType, healthStatus, isSpayedNeutered } =
    validatedFields.data;
  const mapped = toReIntakeData(validatedFields.data);

  try {
    await prisma.$transaction(async (tx) => {
      // Atomically "reactivate" the animal in a single step — the update
      // only succeeds if the animal is currently archived.
      const updateResult = await tx.animal.updateMany({
        where: {
          id: validatedAnimalId,
          listingStatus: AnimalListingStatus.ARCHIVED,
        },
        data: {
          listingStatus: AnimalListingStatus.DRAFT,
          archiveReason: null,
          healthStatus: healthStatus,
          isSpayedNeutered: isSpayedNeutered,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError(
          "Cannot process re-intake: This animal is not currently archived or was just re-intaked.",
        );
      }

      // Create a new Intake record for this event
      await tx.intake.create({
        data: {
          intakeDate,
          type: intakeType,
          notes: mapped.notes,
          animalId: validatedAnimalId,
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
    if (error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to process re-intake.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${validatedAnimalId}`);

  return {
    ok: true,
    message: "Animal re-intake processed successfully.",
    redirectTo: `/dashboard/animals/${validatedAnimalId}`,
  };
};

const INTAKES_PATH = "/dashboard/intakes";

/**
 * Correct the details of a recorded intake. The work, including why the type
 * is correctable here although an outcome's is not, is in
 * `intake-correction`; this is the authorization, the transaction and the
 * cache invalidation around it.
 */
const _updateIntake = async (
  user: SessionUser,
  intakeId: string,
  values: IntakeCorrectionFormInput,
): Promise<FormResult<IntakeCorrectionFormInput>> => {
  const staffMemberId = user.personId;

  if (!staffMemberId) {
    return {
      ok: false,
      message:
        "Authentication Error: Your user account is not associated with a person record.",
    };
  }

  const parsedId = cuidSchema.safeParse(intakeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid intake ID format." };
  }

  const validatedFields = IntakeCorrectionFormSchema.safeParse(values);
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Update Intake.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<IntakeCorrectionFormInput>,
    };
  }

  let correction: IntakeCorrection;
  try {
    correction = await prisma.$transaction((tx) =>
      recordIntakeCorrection(
        tx,
        parsedId.data,
        toIntakeCorrectionValues(validatedFields.data),
        staffMemberId,
      ),
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, message: error.message };
    }
    console.error("Database error updating intake:", error);
    return { ok: false, message: "Database Error: Failed to update intake." };
  }

  switch (correction.status) {
    case "refused":
      // Shown under the picker, and as the form's message.
      return {
        ok: false,
        message: correction.message,
        fieldErrors: { intakeDate: [correction.message] },
      };
    case "unchanged":
      return {
        ok: true,
        message: "No changes to save.",
        redirectTo: INTAKES_PATH,
      };
    case "corrected":
      revalidatePath(INTAKES_PATH);
      revalidatePath(`/dashboard/animals/${correction.animalId}`);
      return {
        ok: true,
        message: "Intake updated successfully.",
        redirectTo: INTAKES_PATH,
      };
  }
};

export const createReIntake = withAuthenticatedUser(
  RequirePermission(AppPermissions.INTAKE_MANAGE)(_createReIntake)
);

export const updateIntake = withAuthenticatedUser(
  RequirePermission(AppPermissions.INTAKE_MANAGE)(_updateIntake),
);
