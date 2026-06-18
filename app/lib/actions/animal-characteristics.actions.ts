"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

// Define a Zod schema for input validation
const updateCharacteristicsSchema = z.object({
  animalId: cuidSchema,
  characteristicIds: z.array(cuidSchema),
});

/**
 * Replaces all assigned characteristics for a given animal with a new set.
 * This is an "upsert" style operation: it calculates the difference between
 * the current and new set and performs the necessary connect/disconnect operations.
 * @param animalId The ID of the animal to update.
 * @param characteristicIds The complete array of characteristic IDs that should be assigned.
 */
const _updateAnimalCharacteristics = async (data: {
  animalId: string;
  characteristicIds: string[];
}) => {
  const validation = updateCharacteristicsSchema.safeParse(data);
  if (!validation.success) {
    return {
      success: false,
      message: "Invalid input. Please check the provided data.",
      errors: z.treeifyError(validation.error),
    };
  }

  const { animalId, characteristicIds } = validation.data;
  const newIds = new Set(characteristicIds);

  try {
    // Check for any soft-deleted characteristics before starting the transaction.
    const deletedCount = await prisma.characteristic.count({
      where: {
        id: { in: characteristicIds },
        deletedAt: { not: null },
      },
    });

    if (deletedCount > 0) {
      return {
        success: false,
        message:
          "One or more characteristics are no longer available and cannot be assigned.",
      };
    }

    // Start a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: {
          characteristics: {
            select: { id: true },
          },
        },
      });
      if (!animal) {
        throw new Error("Animal not found.");
      }
      const currentIds = new Set(animal.characteristics.map((c) => c.id));
      const toConnect = characteristicIds
        .filter((id) => !currentIds.has(id))
        .map((id) => ({ id }));
      const toDisconnect = Array.from(currentIds)
        .filter((id) => !newIds.has(id))
        .map((id) => ({ id }));
      await tx.animal.update({
        where: { id: animalId },
        data: {
          characteristics: {
            connect: toConnect,
            disconnect: toDisconnect,
          },
        },
      });
    });

    // Revalidate the animal's detail page to show updated characteristics
    revalidatePath(`/dashboard/animals/${animalId}/characteristics`);
    revalidatePath(`/pets/${animalId}`);
    return {
      success: true,
      message: "Characteristics updated successfully.",
    };
  } catch (error) {
    console.error("Failed to update animal characteristics:", error);
    return {
      success: false,
      message: "Failed to update characteristics due to a server error.",
    };
  }
};

export const updateAnimalCharacteristics = RequirePermission(
  AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE,
)(_updateAnimalCharacteristics);
