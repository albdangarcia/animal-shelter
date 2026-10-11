"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  MedicalItemFormSchema,
  type MedicalItemFormInput,
} from "../zod-schemas/medical-catalog.schemas";
import {
  createMedicalItem as createItem,
  retireMedicalItem as retireItem,
  unretireMedicalItem as unretireItem,
  updateMedicalItem as updateItem,
} from "../services/medical-catalog";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

const SETTINGS_PATH = "/dashboard/settings/medical";

type MedicalItemResult = FormResult<MedicalItemFormInput>;

const refusal = (error: unknown) =>
  error instanceof ConflictError ||
  error instanceof NotFoundError ||
  error instanceof PreconditionFailedError;

const invalidFields = (
  error: z.ZodError<MedicalItemFormInput>,
  verb: string,
): MedicalItemResult => ({
  ok: false,
  message: `Missing or invalid fields. Failed to ${verb} item.`,
  fieldErrors: z.flattenError(error)
    .fieldErrors as FieldErrors<MedicalItemFormInput>,
});

const _createMedicalItem = async (
  _user: SessionUser,
  values: MedicalItemFormInput,
): Promise<MedicalItemResult> => {
  const validated = MedicalItemFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "create");
  }

  try {
    await prisma.$transaction((tx) => createItem(tx, validated.data));
  } catch (error) {
    if (refusal(error)) {
      return { ok: false, message: (error as Error).message };
    }
    console.error("Database Error creating medical item:", error);
    return { ok: false, message: "Database Error: Failed to create item." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, message: `${validated.data.name} added to the catalog.` };
};

const _updateMedicalItem = async (
  _user: SessionUser,
  itemId: string,
  values: MedicalItemFormInput,
): Promise<MedicalItemResult> => {
  const parsedId = cuidSchema.safeParse(itemId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid item ID format." };
  }
  const validated = MedicalItemFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "update");
  }

  try {
    await prisma.$transaction((tx) =>
      updateItem(tx, parsedId.data, validated.data),
    );
  } catch (error) {
    if (refusal(error)) {
      return { ok: false, message: (error as Error).message };
    }
    console.error("Database Error updating medical item:", error);
    return { ok: false, message: "Database Error: Failed to update item." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, message: `${validated.data.name} updated.` };
};

const setRetired =
  (retire: boolean) =>
  async (
    _user: SessionUser,
    itemId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const parsedId = cuidSchema.safeParse(itemId);
    if (!parsedId.success) {
      return { success: false, message: "Invalid item ID format." };
    }

    try {
      await prisma.$transaction((tx) =>
        retire ? retireItem(tx, parsedId.data) : unretireItem(tx, parsedId.data),
      );
    } catch (error) {
      if (refusal(error)) {
        return { success: false, message: (error as Error).message };
      }
      console.error("Database Error changing medical item retirement:", error);
      return {
        success: false,
        message: `Database Error: Failed to ${retire ? "retire" : "unretire"} item.`,
      };
    }

    revalidatePath(SETTINGS_PATH);
    return {
      success: true,
      message: retire ? "Item retired." : "Item unretired.",
    };
  };

export const createMedicalItem = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_createMedicalItem),
);

export const updateMedicalItem = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_updateMedicalItem),
);

export const retireMedicalItem = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(setRetired(true)),
);

export const unretireMedicalItem = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(setRetired(false)),
);
