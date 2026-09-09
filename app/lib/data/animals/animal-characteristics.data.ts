import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

/** Provenance for one active characteristic assignment. */
export type CharacteristicAssignment = {
  assignedByName: string | null;
  assignedAt: Date;
  /** Set once the assignment is sourced from an assessment finding. */
  sourceAssessmentId: string | null;
};

export type CharacteristicWithAssignment = Prisma.CharacteristicGetPayload<object> & {
  isAssigned: boolean;
  /** The active assignment's provenance, or null when the trait isn't assigned. */
  assignment: CharacteristicAssignment | null;
};

const _fetchAnimalCharacteristics = async (
  animalId: string
): Promise<CharacteristicWithAssignment[]> => {

  const validation = cuidSchema.safeParse(animalId);
  if (!validation.success) {
    throw new Error("Invalid animalId format.");
  }

  try {
    const [allCharacteristics, animal] = await Promise.all([
      prisma.characteristic.findMany({
        where: { deletedAt: null },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.animal.findUnique({
        where: { id: animalId },
        select: {
          animalCharacteristics: {
            // Active assignments only — a soft-removed row is kept for its
            // history but the tab treats the trait as unassigned.
            where: { removedAt: null },
            select: {
              characteristicId: true,
              assignedAt: true,
              sourceAssessmentId: true,
              assignedBy: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Handle the case where the animal ID does not exist.
    if (!animal) {
      throw new Error("Animal not found.");
    }

    const assignmentByCharId = new Map(
      animal.animalCharacteristics.map((ac) => [
        ac.characteristicId,
        {
          assignedByName: ac.assignedBy?.name ?? null,
          assignedAt: ac.assignedAt,
          sourceAssessmentId: ac.sourceAssessmentId,
        } satisfies CharacteristicAssignment,
      ])
    );

    const result = allCharacteristics.map((characteristic) => ({
      ...characteristic,
      isAssigned: assignmentByCharId.has(characteristic.id),
      assignment: assignmentByCharId.get(characteristic.id) ?? null,
    }));

    return result;
  } catch (error) {
    console.error("Failed to fetch animal characteristics:", error);
    throw new Error("Could not fetch animal characteristics.");
  }
};

export const fetchAnimalCharacteristics = RequirePermission(
  AppPermissions.ANIMAL_CHARACTERISTICS_READ
)(_fetchAnimalCharacteristics);
