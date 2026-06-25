"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SpeciesFormSchema } from "../zod-schemas/taxonomy.schemas";

export interface SpeciesFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
  };
}

const findDuplicate = async (name: string, excludeId?: string) => {
  return prisma.species.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createSpecies = async (
  prevState: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> => {
  const validatedFields = SpeciesFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create species.",
    };
  }

  const { name } = validatedFields.data;

  try {
    const existing = await findDuplicate(name);
    if (existing) {
      return {
        success: false,
        message: "A species with that name already exists.",
      };
    }

    await prisma.species.create({ data: { name } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        message: "A species with that name already exists.",
      };
    }
    console.error("Database Error creating species:", error);
    return {
      success: false,
      message: "Database Error: Failed to create species.",
    };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { success: true, message: "Species created successfully." };
};

const _updateSpecies = async (
  speciesId: string,
  prevState: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> => {
  const parsedId = cuidSchema.safeParse(speciesId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid species ID format." };
  }

  const validatedFields = SpeciesFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update species.",
    };
  }

  const { name } = validatedFields.data;

  try {
    const existing = await findDuplicate(name, parsedId.data);
    if (existing) {
      return {
        success: false,
        message: "A species with that name already exists.",
      };
    }

    await prisma.species.update({
      where: { id: parsedId.data },
      data: { name },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        message: "A species with that name already exists.",
      };
    }
    console.error("Database Error updating species:", error);
    return {
      success: false,
      message: "Database Error: Failed to update species.",
    };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { success: true, message: "Species updated successfully." };
};

const _deleteSpecies = async (
  speciesId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(speciesId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid species ID format." };
  }

  try {
    // Block deletion if the species has dependents: any non-deleted breed,
    // or any animal. Species is a required parent, so removing it would
    // orphan breeds and break animal records.
    const [breedCount, animalCount] = await Promise.all([
      prisma.breed.count({
        where: { speciesId: parsedId.data, deletedAt: null },
      }),
      prisma.animal.count({ where: { speciesId: parsedId.data } }),
    ]);

    if (breedCount > 0 || animalCount > 0) {
      return {
        success: false,
        message:
          "This species can't be deleted because it still has breeds or animals associated with it.",
      };
    }

    await prisma.species.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Species deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting species:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete species.",
    };
  }
};

const _restoreSpecies = async (
  speciesId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(speciesId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid species ID format." };
  }

  try {
    await prisma.species.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
    revalidatePath("/dashboard/settings/animal-taxonomy");
    return { success: true, message: "Species restored successfully." };
  } catch (error) {
    console.error("Database Error restoring species:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore species.",
    };
  }
};

export const createSpecies = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_createSpecies);

export const updateSpecies = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_updateSpecies);

export const deleteSpecies = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_deleteSpecies);

export const restoreSpecies = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_restoreSpecies);