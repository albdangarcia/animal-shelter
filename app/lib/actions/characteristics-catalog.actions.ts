"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { CharacteristicFormSchema } from "../zod-schemas/characteristic.schemas";

export interface CharacteristicFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
    category?: string[];
  };
}

// Shared duplicate check: case-insensitive, global (name is unique across the
// whole table regardless of category), ignores the row being edited (so
// renaming a characteristic to itself doesn't collide).
const findDuplicate = async (name: string, excludeId?: string) => {
  return prisma.characteristic.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createCharacteristic = async (
  prevState: CharacteristicFormState,
  formData: FormData,
): Promise<CharacteristicFormState> => {
  const validatedFields = CharacteristicFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create characteristic.",
    };
  }

  const { name, category } = validatedFields.data;

  try {
    const existing = await findDuplicate(name);
    if (existing) {
      return {
        success: false,
        message: "A characteristic with that name already exists.",
      };
    }

    await prisma.characteristic.create({ data: { name, category } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        message: "A characteristic with that name already exists.",
      };
    }
    console.error("Database Error creating characteristic:", error);
    return {
      success: false,
      message: "Database Error: Failed to create characteristic.",
    };
  }

  revalidatePath("/dashboard/settings/characteristics");
  return { success: true, message: "Characteristic created successfully." };
};

const _updateCharacteristic = async (
  characteristicId: string,
  prevState: CharacteristicFormState,
  formData: FormData,
): Promise<CharacteristicFormState> => {
  const parsedId = cuidSchema.safeParse(characteristicId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid characteristic ID format." };
  }

  const validatedFields = CharacteristicFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update characteristic.",
    };
  }

  const { name, category } = validatedFields.data;

  try {
    const existing = await findDuplicate(name, parsedId.data);
    if (existing) {
      return {
        success: false,
        message: "A characteristic with that name already exists.",
      };
    }

    await prisma.characteristic.update({
      where: { id: parsedId.data },
      data: { name, category },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        message: "A characteristic with that name already exists.",
      };
    }
    console.error("Database Error updating characteristic:", error);
    return {
      success: false,
      message: "Database Error: Failed to update characteristic.",
    };
  }

  revalidatePath("/dashboard/settings/characteristics");
  return { success: true, message: "Characteristic updated successfully." };
};

const _deleteCharacteristic = async (
  characteristicId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(characteristicId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid characteristic ID format." };
  }

  try {
    await prisma.characteristic.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/dashboard/settings/characteristics");
    return { success: true, message: "Characteristic deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting characteristic:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete characteristic.",
    };
  }
};

const _restoreCharacteristic = async (
  characteristicId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(characteristicId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid characteristic ID format." };
  }

  try {
    await prisma.characteristic.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
    revalidatePath("/dashboard/settings/characteristics");
    return { success: true, message: "Characteristic restored successfully." };
  } catch (error) {
    console.error("Database Error restoring characteristic:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore characteristic.",
    };
  }
};

export const createCharacteristic = RequirePermission(
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
)(_createCharacteristic);

export const updateCharacteristic = RequirePermission(
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
)(_updateCharacteristic);

export const deleteCharacteristic = RequirePermission(
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
)(_deleteCharacteristic);

export const restoreCharacteristic = RequirePermission(
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
)(_restoreCharacteristic);