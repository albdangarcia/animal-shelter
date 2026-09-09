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
import { AnimalActivityType } from "@/prisma/generated/enums";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// Define a Zod schema for input validation
const updateCharacteristicsSchema = z.object({
  animalId: cuidSchema,
  characteristicIds: z.array(cuidSchema),
});

type CharacteristicsInput = z.infer<typeof updateCharacteristicsSchema>;
type CharacteristicsResult = FormResult<CharacteristicsInput>;

/**
 * Reconciles an animal's assigned characteristics against a target set.
 *
 * The client still submits the whole desired set (the tab is a multi-select),
 * but this is no longer a blind `set`: it diffs the target against the animal's
 * currently-active assignments and records provenance. A newly-assigned
 * trait gets an `AnimalCharacteristic` row stamped with the acting user and the
 * current time; an un-assigned trait is soft-removed (`removedAt` /
 * `removedById`) rather than deleted, so "removed by X on date Y" survives.
 * Re-assigning a previously-removed trait clears the removal on the same row —
 * the `(animalId, characteristicId)` unique key means there is only ever one.
 *
 * `sourceAssessmentId` is always reset to null here: this action is the manual
 * path.
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
  const targetIds = new Set(characteristicIds);
  const now = new Date();

  try {
    // Reject soft-deleted catalog entries before touching anything.
    const deletedCount = await prisma.characteristic.count({
      where: {
        id: { in: characteristicIds },
        deletedAt: { not: null },
      },
    });

    if (deletedCount > 0) {
      return {
        ok: false,
        message:
          "One or more characteristics are no longer available and cannot be assigned.",
      };
    }

    await prisma.$transaction(async (tx) => {
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: {
          animalCharacteristics: {
            where: { removedAt: null },
            select: { characteristicId: true },
          },
        },
      });
      if (!animal) {
        throw new Error("Animal not found.");
      }

      const activeIds = new Set(
        animal.animalCharacteristics.map((ac) => ac.characteristicId),
      );
      const toAdd = characteristicIds.filter((id) => !activeIds.has(id));
      const toRemove = [...activeIds].filter((id) => !targetIds.has(id));

      for (const characteristicId of toAdd) {
        await tx.animalCharacteristic.upsert({
          where: {
            animalId_characteristicId: { animalId, characteristicId },
          },
          create: {
            animalId,
            characteristicId,
            assignedById: user.personId,
            assignedAt: now,
          },
          // A row already exists only when this trait was previously removed;
          // reactivate it and re-stamp the provenance for this manual action.
          update: {
            assignedById: user.personId,
            assignedAt: now,
            sourceAssessmentId: null,
            note: null,
            removedAt: null,
            removedById: null,
          },
        });
      }

      if (toRemove.length > 0) {
        await tx.animalCharacteristic.updateMany({
          where: {
            animalId,
            characteristicId: { in: toRemove },
            removedAt: null,
          },
          data: { removedAt: now, removedById: user.personId },
        });
      }

      if (toAdd.length === 0 && toRemove.length === 0) {
        return;
      }

      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`${toAdd.length} added`);
      if (toRemove.length > 0) parts.push(`${toRemove.length} removed`);

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.FIELD_UPDATE,
          changedById: user.personId,
          changeSummary: `Characteristics updated (${parts.join(", ")}).`,
        },
      });
    });

    revalidatePath(`/dashboard/animals/${animalId}/characteristics`);
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
