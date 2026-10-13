"use server";

import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  withAuthenticatedUser,
  SessionUser,
  RequirePermission,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { VitalsFormInput, VitalsFormSchema } from "../zod-schemas/vitals.schemas";
import { AnimalActivityType } from "@/prisma/generated/enums";
import {
  VitalsRefusal,
  recomputeCurrentWeight,
  recordVitals,
} from "../services/vitals";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type VitalsResult = FormResult<VitalsFormInput>;

// String -> DB conversion for the vitals form. Values arrive already typed
// (no FormData), so this is only shaping, not parsing.
const toVitalsData = (data: z.output<typeof VitalsFormSchema>) => ({
  recordedAt: data.recordedAt,
  weightGrams: data.weightGrams,
  temperatureC: data.temperatureC,
  bodyConditionScore: data.bodyConditionScore,
  notes: data.notes || null,
});

const _createVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  values: VitalsFormInput,
): Promise<VitalsResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = VitalsFormSchema.safeParse(values);
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to record vitals.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<VitalsFormInput>,
    };
  }

  try {
    const unitSystem = (await getShelterSettings()).weightUnitSystem;
    await prisma.$transaction((tx) =>
      recordVitals(
        tx,
        { animalId, ...toVitalsData(validatedFields.data) },
        user.personId,
        { unitSystem },
      ),
    );
  } catch (error) {
    if (error instanceof VitalsRefusal) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }
    console.error("Database Error creating vitals log:", error);
    return { ok: false, message: "Database Error: Failed to record vitals." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/medical/vitals`);

  // The Medical overview shows the current weight.

  revalidatePath(`/dashboard/animals/${animalId}/medical`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  return { ok: true, message: "Vitals entry recorded successfully." };
};

const _updateVitalsEntry = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  vitalsLogId: string,
  animalId: string,
  values: VitalsFormInput,
): Promise<VitalsResult> => {
  const parsedVitalsLogId = cuidSchema.safeParse(vitalsLogId);
  if (!parsedVitalsLogId.success) {
    return { ok: false, message: "Invalid vitals log ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = VitalsFormSchema.safeParse(values);
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update vitals entry.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<VitalsFormInput>,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // deletedAt: null — a soft-deleted entry must be restored before it can be
      // edited, not silently rewritten while it's hidden from the default view.
      await tx.vitalsLog.update({
        where: { id: vitalsLogId, animalId, deletedAt: null },
        data: toVitalsData(validatedFields.data),
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
    return { ok: false, message: "Database Error: Failed to update vitals entry." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/medical/vitals`);

  // The Medical overview shows the current weight.

  revalidatePath(`/dashboard/animals/${animalId}/medical`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  return { ok: true, message: "Vitals entry updated successfully." };
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

    revalidatePath(`/dashboard/animals/${animalId}/medical/vitals`);

    // The Medical overview shows the current weight.

    revalidatePath(`/dashboard/animals/${animalId}/medical`);
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

    revalidatePath(`/dashboard/animals/${animalId}/medical/vitals`);

    // The Medical overview shows the current weight.

    revalidatePath(`/dashboard/animals/${animalId}/medical`);
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
