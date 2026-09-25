"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { AppPermissions } from "../auth/permissions";
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
import {
  ConflictError,
  NotFoundError,
  TimelineOrderError,
} from "../utils/errors";
import {
  recordIntakeCorrection,
  toIntakeCorrectionValues,
  type IntakeCorrection,
} from "../services/intake-correction";
import { recordReIntake } from "../services/intake-recording";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

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

  try {
    await prisma.$transaction((tx) =>
      recordReIntake(
        tx,
        { animalId: validatedAnimalId, values: validatedFields.data },
        staffMemberId,
      ),
    );
  } catch (error) {
    if (error instanceof TimelineOrderError) {
      // Shown under the picker, and as the form's message.
      return {
        ok: false,
        message: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }
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
