"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { BreedFormSchema } from "../zod-schemas/taxonomy.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type BreedFormInput = z.input<typeof BreedFormSchema>;
type BreedResult = FormResult<BreedFormInput>;

// Duplicate check scoped per species (matches @@unique([name, speciesId])).
const findDuplicate = async (
  name: string,
  speciesId: string,
  excludeId?: string,
) => {
  return prisma.breed.findFirst({
    where: {
      speciesId,
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

// Ensure the chosen species exists and isn't soft-deleted.
const isActiveSpecies = async (speciesId: string) => {
  const species = await prisma.species.findFirst({
    where: { id: speciesId, deletedAt: null },
    select: { id: true },
  });
  return Boolean(species);
};

const _createBreed = async (values: BreedFormInput): Promise<BreedResult> => {
  const validatedFields = BreedFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create breed.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<BreedFormInput>,
    };
  }

  const { name, speciesId, typicalSize } = validatedFields.data;

  try {
    if (!(await isActiveSpecies(speciesId))) {
      return { ok: false, message: "The selected species no longer exists." };
    }

    const existing = await findDuplicate(name, speciesId);
    if (existing) {
      return {
        ok: false,
        message: "A breed with that name already exists for this species.",
      };
    }

    await prisma.breed.create({
      data: { name, speciesId, typicalSize: typicalSize || null },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "A breed with that name already exists for this species.",
      };
    }
    console.error("Database Error creating breed:", error);
    return { ok: false, message: "Database Error: Failed to create breed." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Breed created successfully." };
};

const _updateBreed = async (
  breedId: string,
  values: BreedFormInput,
): Promise<BreedResult> => {
  const parsedId = cuidSchema.safeParse(breedId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid breed ID format." };
  }

  const validatedFields = BreedFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update breed.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<BreedFormInput>,
    };
  }

  const { name, speciesId, typicalSize } = validatedFields.data;

  try {
    if (!(await isActiveSpecies(speciesId))) {
      return { ok: false, message: "The selected species no longer exists." };
    }

    const existing = await findDuplicate(name, speciesId, parsedId.data);
    if (existing) {
      return {
        ok: false,
        message: "A breed with that name already exists for this species.",
      };
    }

    await prisma.breed.update({
      where: { id: parsedId.data },
      data: { name, speciesId, typicalSize: typicalSize || null },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "A breed with that name already exists for this species.",
      };
    }
    console.error("Database Error updating breed:", error);
    return { ok: false, message: "Database Error: Failed to update breed." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Breed updated successfully." };
};

const _deleteBreed = async (
  breedId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(breedId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid breed ID format." };
  }

  try {
    // Breeds delete freely (soft). Consumption views filter deletedAt: null,
    // so an animal still linked to a deleted breed simply won't display it.
    await prisma.breed.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Breed deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting breed:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete breed.",
    };
  }
};

const _restoreBreed = async (
  breedId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(breedId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid breed ID format." };
  }

  try {
    await prisma.breed.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Breed restored successfully." };
  } catch (error) {
    console.error("Database Error restoring breed:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore breed.",
    };
  }
};

export const createBreed = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_createBreed);

export const updateBreed = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_updateBreed);

export const deleteBreed = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_deleteBreed);

export const restoreBreed = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_restoreBreed);