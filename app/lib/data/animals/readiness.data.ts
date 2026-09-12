import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequireAllPermissions } from "../../auth/protected-actions";
import {
  contradictionsByCharacteristic,
  proposalsOf,
} from "../../assessments/proposals";
import { RECORDED_FINDINGS_SELECT, toRecordedAssessment } from "./assessment-characteristic-review";
import { readinessRequirementsFor } from "../../readiness/requirements";
import {
  computeReadiness,
  type ReadinessAssessment,
  type ReadinessBlocker,
  type ReadinessCharacteristicClaim,
} from "../../readiness/compute-readiness";

// Live (non-deleted) assessments, shaped for both readiness's own signals
// (template key, signal) and the characteristic-contradiction logic
// (`RECORDED_FINDINGS_SELECT`'s proposing fields + answers), so one query
// serves both without re-fetching.
const READINESS_ASSESSMENT_SELECT = {
  id: true,
  observedAt: true,
  signal: true,
  template: {
    select: {
      key: true,
      ...RECORDED_FINDINGS_SELECT.template.select,
    },
  },
  answers: RECORDED_FINDINGS_SELECT.answers,
} satisfies Prisma.AssessmentSelect;

// The animal's active characteristic assignments, with enough of the sourcing
// assessment to tell whether it's been deleted or has stopped proposing the
// trait — the same provenance the Characteristics tab reads.
const READINESS_CLAIM_SELECT = {
  characteristicId: true,
  characteristic: { select: { name: true } },
  sourceAssessment: { select: { ...RECORDED_FINDINGS_SELECT, deletedAt: true } },
} satisfies Prisma.AnimalCharacteristicSelect;

type ReadinessAssessmentRow = Prisma.AssessmentGetPayload<{
  select: typeof READINESS_ASSESSMENT_SELECT;
}>;
type ReadinessClaimRow = Prisma.AnimalCharacteristicGetPayload<{
  select: typeof READINESS_CLAIM_SELECT;
}>;

const notArchived = {
  listingStatus: { not: AnimalListingStatus.ARCHIVED },
} satisfies Prisma.AnimalWhereInput;

const ANIMAL_IDENTITY_SELECT = {
  id: true,
  isSpayedNeutered: true,
  healthStatus: true,
  species: { select: { name: true } },
  _count: { select: { animalImages: true } },
} satisfies Prisma.AnimalSelect;

type AnimalIdentityRow = Prisma.AnimalGetPayload<{
  select: typeof ANIMAL_IDENTITY_SELECT;
}>;

/**
 * Turns one animal's raw rows into its readiness blockers. Shared by the
 * single-animal and the all-animals fetch so the two can never disagree.
 */
function readinessFor(
  animal: AnimalIdentityRow,
  assessmentRows: ReadinessAssessmentRow[],
  claimRows: ReadinessClaimRow[],
): ReadinessBlocker[] {
  const recordedAssessments = assessmentRows.map(toRecordedAssessment);
  const contradictions = contradictionsByCharacteristic(recordedAssessments);

  const assessments: ReadinessAssessment[] = assessmentRows.map((row) => ({
    id: row.id,
    templateKey: row.template.key,
    templateName: row.template.name,
    observedAt: row.observedAt,
    signal: row.signal,
  }));

  const claims: ReadinessCharacteristicClaim[] = claimRows.map((row) => {
    const sourceDeleted = row.sourceAssessment?.deletedAt != null;
    const noLongerSupports =
      row.sourceAssessment !== null &&
      !sourceDeleted &&
      !proposalsOf(toRecordedAssessment(row.sourceAssessment)).some(
        (p) => p.characteristicId === row.characteristicId,
      );
    return {
      characteristicId: row.characteristicId,
      characteristicName: row.characteristic.name,
      contradicted: contradictions.live.has(row.characteristicId),
      sourceDeleted,
      noLongerSupports,
    };
  });

  return computeReadiness({
    requirements: readinessRequirementsFor(animal.species.name),
    assessments,
    claims,
    isSpayedNeutered: animal.isSpayedNeutered,
    hasPhoto: animal._count.animalImages > 0,
    healthStatus: animal.healthStatus,
  });
}

const _fetchAnimalReadiness = async (
  animalId: string,
): Promise<ReadinessBlocker[]> => {
  const [animal, assessmentRows, claimRows] = await Promise.all([
    prisma.animal.findUnique({
      where: { id: animalId },
      select: ANIMAL_IDENTITY_SELECT,
    }),
    prisma.assessment.findMany({
      where: { animalId, deletedAt: null },
      select: READINESS_ASSESSMENT_SELECT,
    }),
    prisma.animalCharacteristic.findMany({
      where: {
        animalId,
        removedAt: null,
        characteristic: { deletedAt: null },
      },
      select: READINESS_CLAIM_SELECT,
    }),
  ]);

  if (!animal) {
    throw new Error("Animal not found.");
  }

  return readinessFor(animal, assessmentRows, claimRows);
};

export const fetchAnimalReadiness = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
)(_fetchAnimalReadiness);

export interface AnimalReadiness {
  animalId: string;
  blockers: ReadinessBlocker[];
}

/**
 * Every non-archived animal's blockers, for the readiness board. Archived
 * animals (adopted, transferred, deceased) are frozen history — nothing
 * about them can still be "blocked" from adoption.
 */
const _fetchReadinessForAnimals = async (): Promise<AnimalReadiness[]> => {
  const [animals, assessmentRows, claimRows] = await Promise.all([
    prisma.animal.findMany({
      where: notArchived,
      select: ANIMAL_IDENTITY_SELECT,
    }),
    prisma.assessment.findMany({
      where: { deletedAt: null, animal: notArchived },
      select: { animalId: true, ...READINESS_ASSESSMENT_SELECT },
    }),
    prisma.animalCharacteristic.findMany({
      where: {
        removedAt: null,
        characteristic: { deletedAt: null },
        animal: notArchived,
      },
      select: { animalId: true, ...READINESS_CLAIM_SELECT },
    }),
  ]);

  const assessmentsByAnimal = new Map<string, ReadinessAssessmentRow[]>();
  for (const { animalId, ...row } of assessmentRows) {
    const list = assessmentsByAnimal.get(animalId) ?? [];
    list.push(row);
    assessmentsByAnimal.set(animalId, list);
  }

  const claimsByAnimal = new Map<string, ReadinessClaimRow[]>();
  for (const { animalId, ...row } of claimRows) {
    const list = claimsByAnimal.get(animalId) ?? [];
    list.push(row);
    claimsByAnimal.set(animalId, list);
  }

  return animals.map((animal) => ({
    animalId: animal.id,
    blockers: readinessFor(
      animal,
      assessmentsByAnimal.get(animal.id) ?? [],
      claimsByAnimal.get(animal.id) ?? [],
    ),
  }));
};

export const fetchReadinessForAnimals = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
)(_fetchReadinessForAnimals);
