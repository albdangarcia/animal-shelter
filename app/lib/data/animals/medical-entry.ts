// The medical entry reads with no auth or `next/*` imports, so database tests
// can call them. `medical-entry.data.ts` wraps them behind MEDICAL_READ.
//
// A voided entry counts for nothing, so every read that derives a fact (the
// latest rabies vaccine, which entries are current) leaves voided entries out.
// Only the history reads them.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

type Db = TransactionClient | typeof prisma;

/**
 * The animal's latest rabies vaccine that isn't voided: the one given last,
 * with an unknown day counted as older than any known one. Null when there is
 * none.
 */
export const findLatestRabiesVaccine = async (
  db: Db,
  animalId: string,
): Promise<{
  entryId: string;
  completedDate: CalendarDay | null;
  validUntilDate: CalendarDay | null;
} | null> => {
  const entry = await db.medicalEntry.findFirst({
    where: {
      animalId,
      kind: MedicalEntryKind.VACCINE,
      voidedAt: null,
      // Whether it was a rabies vaccine is read off what was recorded, not
      // the item as it is now, so changing the catalog can't reclassify it.
      // Every rabies entry stores its duration.
      vaccine: { durationMonths: { not: null } },
    },
    orderBy: [
      { completedDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      id: true,
      completedDate: true,
      vaccine: { select: { validUntilDate: true } },
    },
  });
  if (!entry) return null;
  return {
    entryId: entry.id,
    completedDate: parseCalendarDay(entry.completedDate),
    validUntilDate: parseCalendarDay(entry.vaccine?.validUntilDate ?? null),
  };
};

/** Everything a Medical page shows about one entry, and what its edit form
 * and change history need. */
export const MEDICAL_ENTRY_DISPLAY_SELECT = {
  id: true,
  kind: true,
  completedDate: true,
  source: true,
  vetName: true,
  notes: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  itemId: true,
  item: { select: { name: true } },
  vetPartnerId: true,
  vetPartner: { select: { name: true } },
  administeredBy: { select: { name: true } },
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  vaccine: {
    select: {
      manufacturer: true,
      lotNumber: true,
      lotExpiryDate: true,
      route: true,
      site: true,
      rabiesTagNumber: true,
      durationMonths: true,
      validUntilDate: true,
    },
  },
  test: {
    select: {
      lotNumber: true,
      lotExpiryDate: true,
      results: {
        orderBy: { analyte: { sortOrder: "asc" } },
        select: { analyteId: true, analyteName: true, result: true },
      },
    },
  },
  treatment: {
    select: { doseAmount: true, doseUnit: true, route: true },
  },
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  },
} as const satisfies Prisma.MedicalEntrySelect;

export type MedicalEntryDisplay = Prisma.MedicalEntryGetPayload<{
  select: typeof MEDICAL_ENTRY_DISPLAY_SELECT;
}>;

// Newest first by the day it was given; an unknown day sorts after every
// known one, since it was before intake. Ties go to the later recording.
const NEWEST_FIRST = [
  { completedDate: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] as const satisfies Prisma.MedicalEntryOrderByWithRelationInput[];

/** The animal's latest entries that aren't voided, newest first. */
export const findRecentMedicalEntries = (db: Db, animalId: string, take: number) =>
  db.medicalEntry.findMany({
    where: { animalId, voidedAt: null },
    orderBy: NEWEST_FIRST,
    take,
    select: MEDICAL_ENTRY_DISPLAY_SELECT,
  });

/**
 * One page of the animal's entries, voided ones included: the history is the
 * only read that shows them. `kinds` empty means every kind.
 */
export const findMedicalHistoryPage = async (
  db: Db,
  animalId: string,
  options: { kinds: MedicalEntryKind[]; page: number; perPage: number },
) => {
  const where: Prisma.MedicalEntryWhereInput = {
    animalId,
    ...(options.kinds.length > 0 && { kind: { in: options.kinds } }),
  };
  const [total, entries] = await Promise.all([
    db.medicalEntry.count({ where }),
    db.medicalEntry.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (options.page - 1) * options.perPage,
      take: options.perPage,
      select: MEDICAL_ENTRY_DISPLAY_SELECT,
    }),
  ]);
  return { entries, totalPages: Math.max(1, Math.ceil(total / options.perPage)) };
};

/** The animal's vaccines and tests that aren't voided, newest first. */
export const findVaccinesAndTests = (db: Db, animalId: string) =>
  db.medicalEntry.findMany({
    where: {
      animalId,
      voidedAt: null,
      kind: { in: [MedicalEntryKind.VACCINE, MedicalEntryKind.TEST] },
    },
    orderBy: NEWEST_FIRST,
    select: MEDICAL_ENTRY_DISPLAY_SELECT,
  });

// The fields of an event's before and after that hold an id, and what reads
// them: an event stores ids, a page shows names.
const ID_FIELDS = ["itemId", "vetPartnerId", "administeredById"] as const;

/**
 * Names for every item, partner and person id the entries' events mention,
 * keyed by id (cuids don't collide across tables). For showing an event's
 * before and after as names.
 */
export const findEventNames = async (
  db: Db,
  entries: { events: { before: unknown; after: unknown }[] }[],
): Promise<Record<string, string>> => {
  const ids = { itemId: new Set<string>(), vetPartnerId: new Set<string>(), administeredById: new Set<string>() };
  for (const entry of entries) {
    for (const event of entry.events) {
      for (const side of [event.before, event.after]) {
        if (!side || typeof side !== "object") continue;
        for (const field of ID_FIELDS) {
          const value = (side as Record<string, unknown>)[field];
          if (typeof value === "string") ids[field].add(value);
        }
      }
    }
  }
  const [items, partners, people] = await Promise.all([
    db.medicalItem.findMany({
      where: { id: { in: [...ids.itemId] } },
      select: { id: true, name: true },
    }),
    db.partner.findMany({
      where: { id: { in: [...ids.vetPartnerId] } },
      select: { id: true, name: true },
    }),
    db.person.findMany({
      where: { id: { in: [...ids.administeredById] } },
      select: { id: true, name: true },
    }),
  ]);
  return Object.fromEntries(
    [...items, ...partners, ...people].map((row) => [row.id, row.name]),
  );
};
