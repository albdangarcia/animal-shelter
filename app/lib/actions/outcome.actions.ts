"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import {
  OutcomeFormSchema,
  ReverseOutcomeSchema,
  type OutcomeFormInput,
  type ReverseOutcomeInput,
} from "../zod-schemas/outcome.schema";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  TimelineOrderError,
} from "../utils/errors";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  recordOutcomeReversal,
  type OutcomeReversal,
} from "../services/outcome-reversal";
import {
  recordOutcome,
  recordOutcomeCorrection,
  type OutcomeCorrection,
  type RecordedOutcome,
} from "../services/outcome-recording";

const OUTCOMES_PATH = "/dashboard/outcomes";
const ADOPTION_APPLICATIONS_PATH = "/dashboard/adoption-applications";

// The fosters list and the foster's profile both show the placement, which an
// outcome can end or move the end of.
const revalidateFosterPages = (fosterPersonId: string | null) => {
  if (!fosterPersonId) return;
  revalidatePath("/dashboard/fosters");
  revalidatePath(`/dashboard/people-directory/${fosterPersonId}/fostering`);
};

interface CreateOutcomeIds {
  animalId: string;
  adoptionApplicationId?: string;
}

const _createOutcome = async (
  user: SessionUser,
  ids: CreateOutcomeIds,
  values: OutcomeFormInput,
): Promise<FormResult<OutcomeFormInput>> => {
  const staffMemberId = user.personId;

  const { animalId, adoptionApplicationId } = ids;

  // The ids arrive as ordinary arguments now rather than through .bind(), so
  // they are checked like any other caller-supplied input.
  if (!cuidSchema.safeParse(animalId).success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  if (
    adoptionApplicationId &&
    !cuidSchema.safeParse(adoptionApplicationId).success
  ) {
    return { ok: false, message: "Invalid adoption application ID format." };
  }

  const validatedFields = OutcomeFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Process Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<OutcomeFormInput>,
    };
  }

  let recorded: RecordedOutcome;
  try {
    recorded = await prisma.$transaction((tx) =>
      recordOutcome(
        tx,
        { animalId, adoptionApplicationId, values: validatedFields.data },
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
    console.error("Database error processing outcome:", error);
    if (
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to process outcome.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidateFosterPages(recorded.fosterPersonId);

  if (adoptionApplicationId) {
    revalidatePath(ADOPTION_APPLICATIONS_PATH);
    revalidatePath(
      `${ADOPTION_APPLICATIONS_PATH}/${adoptionApplicationId}/edit`,
    );
  }

  return {
    ok: true,
    message: "Outcome processed successfully.",
    redirectTo: OUTCOMES_PATH,
  };
};

/**
 * Correct an outcome's day, notes, partner or owner. The work is in
 * `outcome-recording`; this is the authorization, the validation and the
 * cache invalidation around it.
 */
const _updateOutcome = async (
  user: SessionUser,
  outcomeId: string,
  values: OutcomeFormInput,
): Promise<FormResult<OutcomeFormInput>> => {
  const parsedId = cuidSchema.safeParse(outcomeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid outcome ID format." };
  }

  const validatedFields = OutcomeFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Update Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<OutcomeFormInput>,
    };
  }

  let correction: OutcomeCorrection;
  try {
    correction = await recordOutcomeCorrection(
      parsedId.data,
      validatedFields.data,
      user.personId,
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
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { ok: false, message: error.message };
    }
    console.error("Database error updating outcome:", error);
    return { ok: false, message: "Database Error: Failed to update outcome." };
  }

  if (correction.status === "unchanged") {
    return {
      ok: true,
      message: "No changes to save.",
      redirectTo: OUTCOMES_PATH,
    };
  }

  revalidatePath(OUTCOMES_PATH);
  revalidatePath(`/dashboard/animals/${correction.animalId}`);
  revalidateFosterPages(correction.fosterPersonId);

  return {
    ok: true,
    message: "Outcome updated successfully.",
    redirectTo: OUTCOMES_PATH,
  };
};

/**
 * Reverse an outcome recorded in error. The work, and why a reversal voids the
 * outcome rather than deleting it, is in `outcome-reversal`; this is the
 * authorization, the transaction and the cache invalidation around it.
 */
const _reverseOutcome = async (
  user: SessionUser,
  outcomeId: string,
  values: ReverseOutcomeInput,
): Promise<FormResult<ReverseOutcomeInput>> => {
  const parsedId = cuidSchema.safeParse(outcomeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid outcome ID format." };
  }

  const validatedFields = ReverseOutcomeSchema.safeParse(values);
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Reverse Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ReverseOutcomeInput>,
    };
  }

  let reversal: OutcomeReversal;
  try {
    reversal = await prisma.$transaction((tx) =>
      recordOutcomeReversal(
        tx,
        parsedId.data,
        validatedFields.data.reason,
        user.personId,
      ),
    );
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { ok: false, message: error.message };
    }
    console.error("Database error reversing outcome:", error);
    return {
      ok: false,
      message: "Database Error: Failed to reverse outcome.",
    };
  }

  revalidatePath(OUTCOMES_PATH);
  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${reversal.animalId}`);
  // Every application on the animal can read differently now: the adopter's
  // is no longer adopted, and the ones the outcome closed are open again.
  revalidatePath(ADOPTION_APPLICATIONS_PATH);
  if (reversal.adoptionApplicationId) {
    revalidatePath(
      `${ADOPTION_APPLICATIONS_PATH}/${reversal.adoptionApplicationId}/edit`,
    );
  }
  if (reversal.reopenedPlacementId) {
    revalidatePath("/dashboard/fosters");
  }
  if (reversal.restoredUnitId) {
    revalidatePath("/dashboard/locations");
  }

  return {
    ok: true,
    message: `Outcome reversed. ${reversal.effects}`,
    redirectTo: OUTCOMES_PATH,
  };
};

export const createOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_createOutcome),
);

export const updateOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_updateOutcome),
);

export const reverseOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_REVERSE)(_reverseOutcome),
);