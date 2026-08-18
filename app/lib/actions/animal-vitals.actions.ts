"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  withAuthenticatedUser,
  SessionUser,
  RequirePermission,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { VitalsFormSchema } from "../zod-schemas/vitals.schemas";
import { AnimalActivityType } from "@/prisma/generated/enums";
import { formatWeight } from "../utils/weight-format";
import { LATEST_ENTRY_ORDER } from "../utils/vitals-order";

export interface VitalsFormState {
  success?: boolean;
  message?: string | null;
  errors?: Record<string, string[] | undefined>;
}

const toNullableNumber = (value: number | "" | undefined): number | null =>
  typeof value === "number" ? value : null;

/**
 * The ONLY function allowed to write Animal.currentWeightGrams. Recomputes it as the
 * weightGrams of the most recent non-deleted VitalsLog entry with a non-null weight,
 * ordered by recordedAt — NOT createdAt, since a backdated entry must not "win" just
 * because it was entered most recently. Must be called, inside the same transaction,
 * after every vitals create/update/delete/restore.
 */
const recomputeCurrentWeight = async (
  tx: Prisma.TransactionClient,
  animalId: string
): Promise<number | null> => {
  const latestWeighIn = await tx.vitalsLog.findFirst({
    where: { animalId, deletedAt: null, weightGrams: { not: null } },
    orderBy: LATEST_ENTRY_ORDER,
    select: { weightGrams: true },
  });

  const currentWeightGrams = latestWeighIn?.weightGrams ?? null;
  await tx.animal.update({
    where: { id: animalId },
    data: { currentWeightGrams },
  });
  return currentWeightGrams;
};

const _createVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  prevState: VitalsFormState,
  formData: FormData
): Promise<VitalsFormState> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  const validatedFields = VitalsFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );
  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to record vitals.",
    };
  }

  const { weightGrams, temperatureC, bodyConditionScore, recordedAt, notes } =
    validatedFields.data;
  const weight = toNullableNumber(weightGrams);

  try {
    await prisma.$transaction(async (tx) => {
      // Captured before the insert so the activity log can note the change since
      // the prior weigh-in. This is a display convenience, not part of the cache
      // invariant itself, which recomputeCurrentWeight handles independently.
      // Bounded to recordedAt < this entry's recordedAt so a backdated entry is
      // compared against the entry chronologically before it — not whatever is
      // globally latest, which could be a later, unrelated weigh-in.
      const previousWeighIn = await tx.vitalsLog.findFirst({
        where: {
          animalId,
          deletedAt: null,
          weightGrams: { not: null },
          recordedAt: { lt: recordedAt },
        },
        orderBy: LATEST_ENTRY_ORDER,
        select: { weightGrams: true },
      });

      await tx.vitalsLog.create({
        data: {
          animalId,
          recordedById: user.personId,
          recordedAt,
          weightGrams: weight,
          temperatureC: toNullableNumber(temperatureC),
          bodyConditionScore: toNullableNumber(bodyConditionScore),
          notes: notes || null,
        },
      });

      await recomputeCurrentWeight(tx, animalId);

      let changeSummary = "Vitals recorded.";
      if (weight != null) {
        changeSummary = `Weight recorded: ${formatWeight(weight)}`;
        if (previousWeighIn?.weightGrams != null) {
          const delta = weight - previousWeighIn.weightGrams;
          if (delta !== 0) {
            changeSummary += ` (${delta > 0 ? "up" : "down"} ${formatWeight(
              Math.abs(delta)
            )})`;
          }
        }
      }

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.VITALS_RECORDED,
          changedById: user.personId,
          changeSummary,
        },
      });
    });
  } catch (error) {
    console.error("Database Error creating vitals log:", error);
    return { message: "Database Error: Failed to record vitals." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/vitals`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  return { success: true, message: "Vitals entry recorded successfully." };
};

const _updateVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  vitalsLogId: string,
  animalId: string,
  prevState: VitalsFormState,
  formData: FormData
): Promise<VitalsFormState> => {
  const parsedVitalsLogId = cuidSchema.safeParse(vitalsLogId);
  if (!parsedVitalsLogId.success) {
    return { message: "Invalid vitals log ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  const validatedFields = VitalsFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );
  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update vitals entry.",
    };
  }

  const { weightGrams, temperatureC, bodyConditionScore, recordedAt, notes } =
    validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      // deletedAt: null — a soft-deleted entry must be restored before it can be
      // edited, not silently rewritten while it's hidden from the default view.
      await tx.vitalsLog.update({
        where: { id: vitalsLogId, animalId, deletedAt: null },
        data: {
          recordedAt,
          weightGrams: toNullableNumber(weightGrams),
          temperatureC: toNullableNumber(temperatureC),
          bodyConditionScore: toNullableNumber(bodyConditionScore),
          notes: notes || null,
        },
      });

      await recomputeCurrentWeight(tx, animalId);

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.FIELD_UPDATE,
          changedById: user.personId,
          changeSummary: "A vitals entry was updated.",
        },
      });
    });
  } catch (error) {
    console.error("Database Error updating vitals log:", error);
    return { message: "Database Error: Failed to update vitals entry." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/vitals`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  return { success: true, message: "Vitals entry updated successfully." };
};

const _deleteVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  vitalsLogId: string,
  animalId: string
) => {
  const parsedVitalsLogId = cuidSchema.safeParse(vitalsLogId);
  if (!parsedVitalsLogId.success) {
    return { message: "Invalid vitals log ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vitalsLog.update({
        where: { id: parsedVitalsLogId.data, animalId },
        data: { deletedAt: new Date() },
      });

      await recomputeCurrentWeight(tx, animalId);

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.FIELD_UPDATE,
          changedById: user.personId,
          changeSummary: "A vitals entry was deleted.",
        },
      });
    });

    revalidatePath(`/dashboard/animals/${animalId}/vitals`);
    revalidatePath(`/dashboard/animals/${animalId}`);
    return { message: "Vitals entry deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting vitals log:", error);
    return { message: "Database Error: Failed to delete vitals entry." };
  }
};

const _restoreVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  vitalsLogId: string,
  animalId: string
) => {
  const parsedVitalsLogId = cuidSchema.safeParse(vitalsLogId);
  if (!parsedVitalsLogId.success) {
    return { message: "Invalid vitals log ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vitalsLog.update({
        where: { id: parsedVitalsLogId.data, animalId },
        data: { deletedAt: null },
      });

      await recomputeCurrentWeight(tx, animalId);

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.FIELD_UPDATE,
          changedById: user.personId,
          changeSummary: "A vitals entry was restored.",
        },
      });
    });

    revalidatePath(`/dashboard/animals/${animalId}/vitals`);
    revalidatePath(`/dashboard/animals/${animalId}`);
    return { message: "Vitals entry restored successfully." };
  } catch (error) {
    console.error("Database Error restoring vitals log:", error);
    return { message: "Database Error: Failed to restore vitals entry." };
  }
};

export const createVitalsEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_VITALS_MANAGE)(_createVitalsEntry)
);

export const updateVitalsEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_VITALS_MANAGE)(_updateVitalsEntry)
);

export const deleteVitalsEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_VITALS_MANAGE)(_deleteVitalsEntry)
);

export const restoreVitalsEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_VITALS_MANAGE)(_restoreVitalsEntry)
);
