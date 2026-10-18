// Facts about an animal worked out from its medical record: whether it is
// spayed or neutered, which microchips it carries, and its exams. No auth or `next/*`
// imports, so database tests and the entry service can call them. Readiness,
// global search, the public pages and the animal page all read these through
// the fragments and functions here, so they can't disagree. The database
// client is only a type here (callers pass theirs in), so the pure global
// search module can take the where fragments without loading it.

import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  MedicalEntryKind,
  MedicalEntryStatus,
  MicrochipRegistrationStatus,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  openExemptionReview,
  spayNeuterStatus,
  type SpayNeuterEntry,
  type SpayNeuterStatus,
} from "@/app/lib/utils/spay-neuter";
import {
  calendarDay,
  parseCalendarDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  latestExam,
  latestReproductiveFinding,
  type ExamFact,
} from "@/app/lib/utils/exams";

import { RECORDED_VACCINATION_FACT } from "@/app/lib/utils/medical-output";

/** Ready for the public projection; no current-coverage assertion. */
export const RECORDED_VACCINATION_WHERE =
  RECORDED_VACCINATION_FACT satisfies Prisma.MedicalEntryWhereInput;

type Db = TransactionClient | typeof prisma;

const SPAY_NEUTER = [SurgeryProcedure.SPAY, SurgeryProcedure.NEUTER];

/**
 * A spay or neuter that was given and isn't voided. For
 * `medicalEntries: { some: ALTERED_ENTRY_WHERE }`: the animal is altered.
 */
export const ALTERED_ENTRY_WHERE = {
  kind: MedicalEntryKind.SURGERY,
  procedure: { in: SPAY_NEUTER },
  status: MedicalEntryStatus.COMPLETED,
  voidedAt: null,
} as const satisfies Prisma.MedicalEntryWhereInput;

/**
 * A microchip the animal carries: recorded as given and not voided. A
 * scheduled chip isn't in it yet. For `medicalEntries: { some:
 * CURRENT_CHIP_WHERE }`: the animal is chipped.
 */
export const CURRENT_CHIP_WHERE = {
  kind: MedicalEntryKind.MICROCHIP,
  status: MedicalEntryStatus.COMPLETED,
  voidedAt: null,
} as const satisfies Prisma.MedicalEntryWhereInput;

/**
 * For an animal's select, as `medicalEntries`: at most one row for being
 * altered and one for carrying a chip, which `alteredAndChipped` reads as two
 * booleans. One relation can be selected only once, so the two fragments are
 * read together, one row per kind.
 */
export const ALTERED_OR_CHIPPED_SELECT = {
  where: { OR: [ALTERED_ENTRY_WHERE, CURRENT_CHIP_WHERE] },
  distinct: "kind",
  select: { kind: true },
} satisfies Prisma.Animal$medicalEntriesArgs;

/** What `ALTERED_OR_CHIPPED_SELECT` read, as the two facts it answers. */
export const alteredAndChipped = (rows: { kind: MedicalEntryKind }[]) => ({
  isAltered: rows.some((row) => row.kind === MedicalEntryKind.SURGERY),
  hasMicrochip: rows.some((row) => row.kind === MedicalEntryKind.MICROCHIP),
});

/** At most one kind per positive public fact, without clinical fields or identifiers. */
export const PUBLIC_MEDICAL_FACTS_SELECT = {
  where: { OR: [ALTERED_ENTRY_WHERE, CURRENT_CHIP_WHERE, RECORDED_VACCINATION_WHERE] },
  distinct: "kind",
  select: { kind: true },
} satisfies Prisma.Animal$medicalEntriesArgs;

export const publicMedicalFacts = (rows: { kind: MedicalEntryKind }[]) => ({
  ...alteredAndChipped(rows),
  hasRecordedVaccination: rows.some((row) => row.kind === MedicalEntryKind.VACCINE),
});

/**
 * The spay and neuter entries that aren't voided, for each of `animalIds`,
 * read in one query. An animal with none has an empty list.
 */
export const findSpayNeuterEntries = async (
  db: Db,
  animalIds: string[],
): Promise<Map<string, SpayNeuterEntry[]>> => {
  const rows = await db.medicalEntry.findMany({
    where: {
      animalId: { in: animalIds },
      kind: MedicalEntryKind.SURGERY,
      procedure: { in: SPAY_NEUTER },
      voidedAt: null,
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      animalId: true,
      status: true,
      procedure: true,
      completedDate: true,
      exemptionReason: true,
      declineReason: true,
      reviewDate: true,
      updatedAt: true,
    },
  });
  const byAnimal = new Map<string, SpayNeuterEntry[]>(
    animalIds.map((id) => [id, []]),
  );
  for (const { animalId, procedure, ...entry } of rows) {
    // The query reads only spays and neuters.
    byAnimal.get(animalId)?.push({ ...entry, procedure: procedure! });
  }
  return byAnimal;
};

export interface CurrentChip {
  entryId: string;
  chipNumber: string;
  brand: string | null;
  registrationStatus: MicrochipRegistrationStatus;
  registryName: string | null;
  registrationDate: CalendarDay | null;
  /** Null when it was found on the animal on a day nobody knows. */
  completedDate: CalendarDay | null;
}

/**
 * The chips each of `animalIds` carries, newest first (an unknown day
 * last), read in one query. An animal with none has an empty list.
 */
export const findCurrentChips = async (
  db: Db,
  animalIds: string[],
): Promise<Map<string, CurrentChip[]>> => {
  const rows = await db.medicalEntry.findMany({
    where: { animalId: { in: animalIds }, ...CURRENT_CHIP_WHERE },
    orderBy: [
      { completedDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      id: true,
      animalId: true,
      chipNumber: true,
      completedDate: true,
      microchip: { select: { brand: true, registrationStatus: true, registryName: true, registrationDate: true } },
    },
  });
  const byAnimal = new Map<string, CurrentChip[]>(animalIds.map((id) => [id, []]));
  for (const row of rows) {
    byAnimal.get(row.animalId)?.push({
      entryId: row.id,
      // A completed chip always has its number.
      chipNumber: row.chipNumber!,
      brand: row.microchip?.brand ?? null,
      registrationStatus: row.microchip?.registrationStatus ?? MicrochipRegistrationStatus.UNKNOWN,
      registryName: row.microchip?.registryName ?? null,
      registrationDate: parseCalendarDay(row.microchip?.registrationDate),
      completedDate: parseCalendarDay(row.completedDate),
    });
  }
  return byAnimal;
};

/**
 * The exams each of `animalIds` has had, done and not voided, newest first
 * (the later day, then the one recorded later), read in one query. An animal
 * with none has an empty list.
 */
export const findCompletedExams = async (
  db: Db,
  animalIds: string[],
): Promise<Map<string, ExamFact[]>> => {
  const rows = await db.medicalEntry.findMany({
    where: {
      animalId: { in: animalIds },
      kind: MedicalEntryKind.EXAM,
      status: MedicalEntryStatus.COMPLETED,
      voidedAt: null,
    },
    orderBy: [{ completedDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      animalId: true,
      examType: true,
      completedDate: true,
      createdAt: true,
      exam: { select: { overallResult: true, reproductiveStatus: true } },
    },
  });
  const byAnimal = new Map<string, ExamFact[]>(animalIds.map((id) => [id, []]));
  for (const row of rows) {
    // A completed exam always has its type, its day and its details.
    byAnimal.get(row.animalId)?.push({
      entryId: row.id,
      examType: row.examType!,
      completedDate: calendarDay(row.completedDate!),
      overallResult: row.exam!.overallResult,
      reproductiveStatus: row.exam!.reproductiveStatus,
      createdAt: row.createdAt,
    });
  }
  return byAnimal;
};

export interface MedicalStatus {
  spayNeuter: SpayNeuterStatus;
  /** The exemption open for review, if any. */
  exemptionReview: SpayNeuterEntry | null;
  chips: CurrentChip[];
  /** The latest exam done, if any. */
  lastExam: ExamFact | null;
}

/**
 * One animal's spay/neuter status on `today`, its exemption open for review,
 * the chips it carries and its latest exam. The reads run one after the
 * other, so this is safe inside a transaction.
 */
export const findMedicalStatus = async (
  db: Db,
  animalId: string,
  today: CalendarDay,
): Promise<MedicalStatus> => {
  const entries = (await findSpayNeuterEntries(db, [animalId])).get(animalId) ?? [];
  const chips = (await findCurrentChips(db, [animalId])).get(animalId) ?? [];
  const exams = (await findCompletedExams(db, [animalId])).get(animalId) ?? [];
  return {
    spayNeuter: spayNeuterStatus(entries, today, latestReproductiveFinding(exams)),
    exemptionReview: openExemptionReview(entries),
    chips,
    lastExam: latestExam(exams),
  };
};
