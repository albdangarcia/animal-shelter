import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  contradictionsByCharacteristic,
  findingsAgainst,
  proposalsOf,
  type ContradictingFinding,
} from "../../assessments/proposals";
import {
  fetchAnimalFindings,
  RECORDED_FINDINGS_SELECT,
  toRecordedAssessment,
} from "./assessment-characteristic-review";

/** Provenance for one active characteristic assignment. */
export type CharacteristicAssignment = {
  assignedByName: string | null;
  assignedAt: Date;
  /** Set once the assignment is sourced from an assessment finding. */
  sourceAssessmentId: string | null;
  /** Identity of the sourcing assessment, for the tab's link back. */
  sourceAssessment: {
    id: string;
    templateName: string;
    observedAt: Date;
    /** Soft-deleting an assessment leaves the traits it sourced citing it. */
    deletedAt: Date | null;
    /**
     * Whether its findings, as they stand now, still propose this trait — an
     * edit can take that away.
     */
    stillSupports: boolean;
  } | null;
};

export type CharacteristicWithAssignment = Prisma.CharacteristicGetPayload<object> & {
  isAssigned: boolean;
  /** The active assignment's provenance, or null when the trait isn't assigned. */
  assignment: CharacteristicAssignment | null;
  /**
   * Live findings on the animal that argue against the trait, newest first —
   * whether or not it is assigned, so adding it can warn. A finding that a
   * later-observed one proposing the trait has overtaken isn't listed. A
   * warning only — nothing here blocks anything.
   */
  contradictedBy: ContradictingFinding[];
};

const _fetchAnimalCharacteristics = async (
  animalId: string
): Promise<CharacteristicWithAssignment[]> => {

  const validation = cuidSchema.safeParse(animalId);
  if (!validation.success) {
    throw new Error("Invalid animalId format.");
  }

  try {
    const [allCharacteristics, animal, findings] = await Promise.all([
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
              sourceAssessment: {
                select: { ...RECORDED_FINDINGS_SELECT, deletedAt: true },
              },
            },
          },
        },
      }),
      fetchAnimalFindings(prisma, animalId),
    ]);

    // Handle the case where the animal ID does not exist.
    if (!animal) {
      throw new Error("Animal not found.");
    }

    const contradictions = contradictionsByCharacteristic(
      findings.liveAssessments,
    );

    const assignmentByCharId = new Map(
      animal.animalCharacteristics.map((ac) => [
        ac.characteristicId,
        {
          assignedByName: ac.assignedBy?.name ?? null,
          assignedAt: ac.assignedAt,
          sourceAssessmentId: ac.sourceAssessmentId,
          sourceAssessment: ac.sourceAssessment
            ? {
                id: ac.sourceAssessment.id,
                templateName: ac.sourceAssessment.template.name,
                observedAt: ac.sourceAssessment.observedAt,
                deletedAt: ac.sourceAssessment.deletedAt,
                stillSupports: proposalsOf(
                  toRecordedAssessment(ac.sourceAssessment),
                ).some((p) => p.characteristicId === ac.characteristicId),
              }
            : null,
        } satisfies CharacteristicAssignment,
      ])
    );

    const result = allCharacteristics.map((characteristic) => ({
      ...characteristic,
      isAssigned: assignmentByCharId.has(characteristic.id),
      assignment: assignmentByCharId.get(characteristic.id) ?? null,
      contradictedBy: findingsAgainst(contradictions, characteristic.id),
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
