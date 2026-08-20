"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { ColorFormSchema } from "../zod-schemas/color.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type ColorFormInput = z.input<typeof ColorFormSchema>;
type ColorResult = FormResult<ColorFormInput>;

// Shared duplicate check: case-insensitive, global, ignores the row being
// edited (so renaming a color to itself doesn't collide).
const findDuplicate = async (name: string, excludeId?: string) => {
  return prisma.color.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createColor = async (values: ColorFormInput): Promise<ColorResult> => {
  const validatedFields = ColorFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create color.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ColorFormInput>,
    };
  }

  const { name } = validatedFields.data;

  try {
    const existing = await findDuplicate(name);
    if (existing) {
      return { ok: false, message: "A color with that name already exists." };
    }

    await prisma.color.create({ data: { name } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "A color with that name already exists." };
    }
    console.error("Database Error creating color:", error);
    return { ok: false, message: "Database Error: Failed to create color." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Color created successfully." };
};

const _updateColor = async (
  colorId: string,
  values: ColorFormInput,
): Promise<ColorResult> => {
  const parsedId = cuidSchema.safeParse(colorId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid color ID format." };
  }

  const validatedFields = ColorFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update color.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ColorFormInput>,
    };
  }

  const { name } = validatedFields.data;

  try {
    const existing = await findDuplicate(name, parsedId.data);
    if (existing) {
      return { ok: false, message: "A color with that name already exists." };
    }

    await prisma.color.update({
      where: { id: parsedId.data },
      data: { name },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "A color with that name already exists." };
    }
    console.error("Database Error updating color:", error);
    return { ok: false, message: "Database Error: Failed to update color." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Color updated successfully." };
};

const _deleteColor = async (
  colorId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(colorId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid color ID format." };
  }

  try {
    await prisma.color.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Color deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting color:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete color.",
    };
  }
};

const _restoreColor = async (
  colorId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(colorId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid color ID format." };
  }

  try {
    await prisma.color.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Color restored successfully." };
  } catch (error) {
    console.error("Database Error restoring color:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore color.",
    };
  }
};

export const createColor = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_createColor);

export const updateColor = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_updateColor);

export const deleteColor = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_deleteColor);

export const restoreColor = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_restoreColor);