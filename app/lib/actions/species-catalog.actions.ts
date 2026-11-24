"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SpeciesFormSchema } from "../zod-schemas/taxonomy.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  addSpecies,
  deleteSpeciesIfUnused,
  editSpecies,
  restoreSpecies as restoreSpeciesRow,
  SPECIES_NAME_TAKEN,
} from "@/app/lib/services/settings-catalog";

type SpeciesFormInput = z.input<typeof SpeciesFormSchema>;
type SpeciesResult = FormResult<SpeciesFormInput>;

const _createSpecies = async (
  values: SpeciesFormInput,
): Promise<SpeciesResult> => {
  const validatedFields = SpeciesFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create species.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<SpeciesFormInput>,
    };
  }

  const { name, sacCategory } = validatedFields.data;

  try {
    // The name is checked behind a lock on the species' names, so the same
    // name added at the same moment in other capitals is refused.
    const refusal = await prisma.$transaction((tx) =>
      addSpecies(tx, { name, sacCategory: sacCategory || null }),
    );
    if (refusal) {
      return { ok: false, message: refusal };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: SPECIES_NAME_TAKEN };
    }
    console.error("Database Error creating species:", error);
    return { ok: false, message: "Database Error: Failed to create species." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Species created successfully." };
};

const _updateSpecies = async (
  speciesId: string,
  values: SpeciesFormInput,
): Promise<SpeciesResult> => {
  const parsedId = cuidSchema.safeParse(speciesId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid species ID format." };
  }

  const validatedFields = SpeciesFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update species.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<SpeciesFormInput>,
    };
  }

  const { name, sacCategory } = validatedFields.data;

  try {
    const refusal = await prisma.$transaction((tx) =>
      editSpecies(tx, parsedId.data, {
        name,
        // Left out keeps the saved category; "" ("Not reported") clears it.
        sacCategory: sacCategory === undefined ? undefined : sacCategory || null,
      }),
    );
    if (refusal) {
      return { ok: false, message: refusal };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: SPECIES_NAME_TAKEN };
    }
    console.error("Database Error updating species:", error);
    return { ok: false, message: "Database Error: Failed to update species." };
  }

  revalidatePath("/dashboard/settings/animal-taxonomy");
  return { ok: true, message: "Species updated successfully." };
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
    // orphan breeds and break animal records. Checked behind the species'
    // lock, so a breed restored at the same moment is counted or refused.
    const refusal = await prisma.$transaction((tx) =>
      deleteSpeciesIfUnused(tx, parsedId.data),
    );
    if (refusal) {
      return { success: false, message: refusal };
    }

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
    const refusal = await prisma.$transaction((tx) =>
      restoreSpeciesRow(tx, parsedId.data),
    );
    if (refusal) {
      return { success: false, message: refusal };
    }
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