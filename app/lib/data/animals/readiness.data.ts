import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import type {
  AnimalReadiness,
  ReadinessAnimal,
} from "../../readiness/board";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequireAllPermissions } from "../../auth/protected-actions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
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
// trait — the same provenance the Characteristics tab reads — and when.
const READINESS_CLAIM_SELECT = {
  characteristicId: true,
  assignedAt: true,
  characteristic: { select: { name: true } },
  sourceAssessment: {
    select: { ...RECORDED_FINDINGS_SELECT, deletedAt: true, updatedAt: true },
  },
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
  createdAt: true,
  species: { select: { name: true } },
  _count: { select: { animalImages: true } },
  // The latest intake starts the current stay; a returned animal's clock
  // restarts with its new intake.
  intake: {
    select: { intakeDate: true },
    orderBy: { intakeDate: "desc" },
    take: 1,
  },
} satisfies Prisma.AnimalSelect;

type AnimalIdentityRow = Prisma.AnimalGetPayload<{
  select: typeof ANIMAL_IDENTITY_SELECT;
}>;

// What the board shows and filters an animal by, on top of what readiness
// itself reads.
const BOARD_ANIMAL_SELECT = {
  ...ANIMAL_IDENTITY_SELECT,
  name: true,
  listingStatus: true,
  currentUnit: {
    select: { name: true, location: { select: { id: true, name: true } } },
  },
  // "In foster" is an open placement, never a stored flag.
  fosterPlacements: {
    where: { endDate: null },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.AnimalSelect;

type BoardAnimalRow = Prisma.AnimalGetPayload<{
  select: typeof BOARD_ANIMAL_SELECT;
}>;

const toReadinessAnimal = (row: BoardAnimalRow): ReadinessAnimal => ({
  id: row.id,
  name: row.name,
  species: row.species.name,
  listingStatus: row.listingStatus,
  placement: row.currentUnit
    ? {
        kind: "UNIT",
        locationId: row.currentUnit.location.id,
        locationName: row.currentUnit.location.name,
        unitName: row.currentUnit.name,
      }
    : row.fosterPlacements.length > 0
      ? { kind: "FOSTER" }
      : { kind: "UNPLACED" },
});

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
    const source = row.sourceAssessment;
    const sourceDeletedAt = source?.deletedAt ?? null;
    const noLongerSupports =
      source !== null &&
      !sourceDeletedAt &&
      !proposalsOf(toRecordedAssessment(source)).some(
        (p) => p.characteristicId === row.characteristicId,
      );
    const againstIt = contradictions.live.get(row.characteristicId) ?? [];
    const contradictedAt = againstIt.reduce<Date | null>(
      (earliest, { assessment }) =>
        !earliest || assessment.observedAt < earliest
          ? assessment.observedAt
          : earliest,
      null,
    );
    return {
      characteristicId: row.characteristicId,
      characteristicName: row.characteristic.name,
      assignedAt: row.assignedAt,
      contradictedAt,
      sourceDeletedAt,
      supportLostAt: noLongerSupports ? source.updatedAt : null,
    };
  });

  return computeReadiness({
    requirements: readinessRequirementsFor(animal.species.name),
    assessments,
    claims,
    isSpayedNeutered: animal.isSpayedNeutered,
    hasPhoto: animal._count.animalImages > 0,
    healthStatus: animal.healthStatus,
    inCareSince: animal.intake[0]?.intakeDate ?? animal.createdAt,
  });
}

/** One animal's identity and blockers; null when no animal has that id. */
const readinessOfAnimal = async (
  animalId: string,
): Promise<AnimalReadiness | null> => {
  const [animal, assessmentRows, claimRows] = await Promise.all([
    prisma.animal.findUnique({
      where: { id: animalId },
      select: BOARD_ANIMAL_SELECT,
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

  if (!animal) return null;

  return {
    animal: toReadinessAnimal(animal),
    blockers: readinessFor(animal, assessmentRows, claimRows),
  };
};

const _fetchAnimalReadiness = async (
  animalId: string,
): Promise<ReadinessBlocker[]> => {
  const readiness = await readinessOfAnimal(animalId);
  if (!readiness) {
    throw new Error("Animal not found.");
  }
  return readiness.blockers;
};

export const fetchAnimalReadiness = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
)(_fetchAnimalReadiness);

// Exported unwrapped for the AI tool layer: a tool's `execute` runs
// mid-stream where `RequirePermission`'s ambient session read is unreliable.
// `getAnimalReadiness` (and `getAnimalSummary`, for its readiness line) calls
// `requireFor` / `can` for all three reads itself before calling this.
// Carries the animal's identity alongside its blockers, so the tool can tell
// an archived animal from a blocked one. Returns `null` for an unknown or
// malformed id — the tool turns that into a structured failure.
export const _fetchAnimalReadinessForAssistant = async (
  animalId: string,
): Promise<AnimalReadiness | null> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) return null;
  return readinessOfAnimal(parsedId.data);
};

/**
 * Every non-archived animal's blockers, for the readiness board — including
 * animals with none, so the board can say how many are ready. Archived
 * animals (adopted, transferred, deceased) are frozen history — nothing
 * about them can still be "blocked" from adoption.
 */
const _fetchReadinessForAnimals = async (): Promise<AnimalReadiness[]> => {
  const [animals, assessmentRows, claimRows] = await Promise.all([
    prisma.animal.findMany({
      where: notArchived,
      select: BOARD_ANIMAL_SELECT,
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
    animal: toReadinessAnimal(animal),
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
