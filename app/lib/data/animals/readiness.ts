// Readiness's reads: what each animal still needs before it is fully ready
// for adoption, from its assessments, characteristic claims, photos and
// medical record. No auth or `next/*` imports, so database tests can drive
// them; `readiness.data.ts` wraps them with the permissions they need and the
// shelter's day.
import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import type {
  AnimalReadiness,
  ReadinessAnimal,
} from "../../readiness/board";
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
import {
  calendarDay,
  startOfShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { findCompletedExams, findSpayNeuterEntries } from "./medical-status";
import {
  spayNeuterStatus,
  type SpayNeuterEntry,
} from "@/app/lib/utils/spay-neuter";
import {
  latestReproductiveFinding,
  type ExamFact,
} from "@/app/lib/utils/exams";

type Db = typeof prisma;

/**
 * The shelter's timezone and its today, read once by the caller so every
 * animal in one answer is judged on the same day.
 */
export interface ShelterDay {
  timezone: string;
  today: CalendarDay;
}

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
  healthStatus: true,
  createdAt: true,
  species: { select: { name: true } },
  _count: { select: { animalImages: true } },
  // The latest intake starts the current stay; a returned animal's clock
  // restarts with its new intake. Two intakes on one day tie on the date
  // alone, so `createdAt` settles which of them is the later one.
  intake: {
    select: { intakeDate: true },
    orderBy: [{ intakeDate: "desc" }, { createdAt: "desc" }],
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
  spayNeuterEntries: SpayNeuterEntry[],
  exams: ExamFact[],
  { timezone, today }: ShelterDay,
): ReadinessBlocker[] {
  const latestIntake = animal.intake[0];
  const recordedAssessments = assessmentRows.map(toRecordedAssessment);
  const contradictions = contradictionsByCharacteristic(recordedAssessments, timezone);

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
    spayNeuter: spayNeuterStatus(
      spayNeuterEntries,
      today,
      latestReproductiveFinding(exams),
    ),
    hasPhoto: animal._count.animalImages > 0,
    healthStatus: animal.healthStatus,
    // Blockers are dated by instants, so a latest intake — which is a day —
    // is read as the moment that day begins on the shelter's calendar. With
    // no intake at all there is nothing better than when the row was written.
    inCareSince: latestIntake
      ? startOfShelterDay(calendarDay(latestIntake.intakeDate), timezone)
      : animal.createdAt,
    timezone,
  });
}

/** One animal's identity and blockers; null when no animal has that id. */
export const findAnimalReadiness = async (
  db: Db,
  animalId: string,
  shelterDay: ShelterDay,
): Promise<AnimalReadiness | null> => {
  const [animal, assessmentRows, claimRows, spayNeuterEntries, exams] = await Promise.all([
    db.animal.findUnique({
      where: { id: animalId },
      select: BOARD_ANIMAL_SELECT,
    }),
    db.assessment.findMany({
      where: { animalId, deletedAt: null },
      select: READINESS_ASSESSMENT_SELECT,
    }),
    db.animalCharacteristic.findMany({
      where: {
        animalId,
        removedAt: null,
        characteristic: { deletedAt: null },
      },
      select: READINESS_CLAIM_SELECT,
    }),
    findSpayNeuterEntries(db, [animalId]),
    findCompletedExams(db, [animalId]),
  ]);

  if (!animal) return null;

  return {
    animal: toReadinessAnimal(animal),
    blockers: readinessFor(
      animal,
      assessmentRows,
      claimRows,
      spayNeuterEntries.get(animalId) ?? [],
      exams.get(animalId) ?? [],
      shelterDay,
    ),
  };
};

/**
 * Every non-archived animal's blockers, for the readiness board — including
 * animals with none, so the board can say how many are ready. Archived
 * animals (adopted, transferred, deceased) are frozen history — nothing
 * about them can still be "blocked" from adoption.
 *
 * `animalIds` narrows it to those animals, still leaving out archived ones.
 * The board passes none.
 */
export const findReadinessForAnimals = async (
  db: Db,
  shelterDay: ShelterDay,
  { animalIds }: { animalIds?: string[] } = {},
): Promise<AnimalReadiness[]> => {
  const inScope = {
    ...notArchived,
    ...(animalIds && { id: { in: animalIds } }),
  } satisfies Prisma.AnimalWhereInput;
  const [animals, assessmentRows, claimRows] = await Promise.all([
    db.animal.findMany({
      where: inScope,
      select: BOARD_ANIMAL_SELECT,
    }),
    db.assessment.findMany({
      where: { deletedAt: null, animal: inScope },
      select: { animalId: true, ...READINESS_ASSESSMENT_SELECT },
    }),
    db.animalCharacteristic.findMany({
      where: {
        removedAt: null,
        characteristic: { deletedAt: null },
        animal: inScope,
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

  // One query each for every animal's spay and neuter entries and its exams,
  // once the animals are known.
  const animalIdsFound = animals.map((animal) => animal.id);
  const spayNeuterByAnimal = await findSpayNeuterEntries(db, animalIdsFound);
  const examsByAnimal = await findCompletedExams(db, animalIdsFound);
  return animals.map((animal) => ({
    animal: toReadinessAnimal(animal),
    blockers: readinessFor(
      animal,
      assessmentsByAnimal.get(animal.id) ?? [],
      claimsByAnimal.get(animal.id) ?? [],
      spayNeuterByAnimal.get(animal.id) ?? [],
      examsByAnimal.get(animal.id) ?? [],
      shelterDay,
    ),
  }));
};

