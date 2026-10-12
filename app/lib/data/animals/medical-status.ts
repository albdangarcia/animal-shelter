// Facts about an animal worked out from its medical record: whether it is
// spayed or neutered, and which microchips it carries. No auth or `next/*`
// imports, so database tests and the entry service can call them. Readiness,
// global search, the public pages and the animal page all read these through
// the fragments and functions here, so they can't disagree.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  MedicalEntryKind,
  MedicalEntryStatus,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  openExemptionReview,
  spayNeuterStatus,
  type SpayNeuterEntry,
  type SpayNeuterStatus,
} from "@/app/lib/utils/spay-neuter";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

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
      microchip: { select: { brand: true } },
    },
  });
  const byAnimal = new Map<string, CurrentChip[]>(animalIds.map((id) => [id, []]));
  for (const row of rows) {
    byAnimal.get(row.animalId)?.push({
      entryId: row.id,
      // A completed chip always has its number.
      chipNumber: row.chipNumber!,
      brand: row.microchip?.brand ?? null,
      completedDate: parseCalendarDay(row.completedDate),
    });
  }
  return byAnimal;
};

export interface MedicalStatus {
  spayNeuter: SpayNeuterStatus;
  /** The exemption open for review, if any. */
  exemptionReview: SpayNeuterEntry | null;
  chips: CurrentChip[];
}

/**
 * One animal's spay/neuter status on `today`, its exemption open for review,
 * and the chips it carries. The two reads run one after the other, so this
 * is safe inside a transaction.
 */
export const findMedicalStatus = async (
  db: Db,
  animalId: string,
  today: CalendarDay,
): Promise<MedicalStatus> => {
  const entries = (await findSpayNeuterEntries(db, [animalId])).get(animalId) ?? [];
  const chips = (await findCurrentChips(db, [animalId])).get(animalId) ?? [];
  return {
    spayNeuter: spayNeuterStatus(entries, today),
    exemptionReview: openExemptionReview(entries),
    chips,
  };
};
