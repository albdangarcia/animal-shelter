"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  withAuthenticatedUser,
  RequirePermission,
  type SessionUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { reconcileAnimalCharacteristics } from "../services/animal-characteristics";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// Define a Zod schema for input validation
const updateCharacteristicsSchema = z.object({
  animalId: cuidSchema,
  characteristicIds: z.array(cuidSchema),
});

type CharacteristicsInput = z.input<typeof updateCharacteristicsSchema>;
type CharacteristicsResult = FormResult<CharacteristicsInput>;

/**
 * Reconciles an animal's assigned characteristics against a target set. The
 * client still submits the whole desired set (the tab is a multi-select);
 * `reconcileAnimalCharacteristics` diffs it against what is assigned, and
 * resets a re-assigned trait's sources: this is the manual path.
 */
const _updateAnimalCharacteristics = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  data: CharacteristicsInput,
): Promise<CharacteristicsResult> => {
  const validation = updateCharacteristicsSchema.safeParse(data);
  if (!validation.success) {
    return {
      ok: false,
      message: "Invalid input. Please check the provided data.",
      fieldErrors: z.flattenError(validation.error)
        .fieldErrors as FieldErrors<CharacteristicsInput>,
    };
  }

  const { animalId, characteristicIds } = validation.data;
  const now = new Date();

  try {
    const outcome = await prisma.$transaction((tx) =>
      reconcileAnimalCharacteristics(
        tx,
        { animalId, characteristicIds },
        user.personId,
        now,
      ),
    );

    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }

    revalidatePath(`/dashboard/animals/${animalId}/characteristics`);
    // What each assessment's own page suggests depends on the animal's
    // traits: an added one can be cited, a removed one can be re-suggested.
    revalidatePath(`/dashboard/animals/${animalId}/assessments`);
    revalidatePath("/dashboard/animals/[id]/assessments/[assessmentId]", "page");
    revalidatePath(`/dashboard/animals/${animalId}`);
    revalidatePath(`/pets/${animalId}`);
    return {
      ok: true,
      message: "Characteristics updated successfully.",
    };
  } catch (error) {
    console.error("Failed to update animal characteristics:", error);
    return {
      ok: false,
      message: "Failed to update characteristics due to a server error.",
    };
  }
};

export const updateAnimalCharacteristics = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE)(
    _updateAnimalCharacteristics,
  ),
);
