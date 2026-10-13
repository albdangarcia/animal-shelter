// The medical entry reads with no auth or `next/*` imports, so database tests
// can call them. `medical-entry.data.ts` wraps them behind MEDICAL_READ.
//
// A read that derives a fact (the latest rabies vaccine, which entries are
// current) counts only completed entries that aren't voided: scheduled care
// hasn't happened, declined care never will, and a voided entry counts for
// nothing. The due list reads scheduled entries that aren't voided. Only the
// history reads every entry.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import { MedicalEntryKind, MedicalEntryStatus } from "@/prisma/generated/enums";
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
      status: MedicalEntryStatus.COMPLETED,
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
  status: true,
  dueDate: true,
  completedDate: true,
  source: true,
  declineReason: true,
  procedure: true,
  chipNumber: true,
  examType: true,
  exemptionReason: true,
  reviewDate: true,
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
  surgery: {
    select: {
      surgeon: true,
      findings: true,
      anesthesiaNotes: true,
      evidence: true,
      foundOnExamId: true,
    },
  },
  microchip: { select: { brand: true } },
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

/** The animal's latest completed entries that aren't voided, newest first. */
export const findRecentMedicalEntries = (db: Db, animalId: string, take: number) =>
  db.medicalEntry.findMany({
    where: { animalId, status: MedicalEntryStatus.COMPLETED, voidedAt: null },
    orderBy: NEWEST_FIRST,
    take,
    select: MEDICAL_ENTRY_DISPLAY_SELECT,
  });

/**
 * The animal's scheduled care that isn't voided, soonest due first. Overdue
 * care is in it: whether an entry is overdue is worked out against the
 * shelter's today by whoever shows it.
 */
export const findDueMedicalEntries = (db: Db, animalId: string) =>
  db.medicalEntry.findMany({
    where: { animalId, status: MedicalEntryStatus.SCHEDULED, voidedAt: null },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: MEDICAL_ENTRY_DISPLAY_SELECT,
  });

// Open scheduled care given from the catalog. Surgeries and microchips have
// no item, so they aren't in these reads.
const OPEN_SCHEDULED_ITEM_WHERE = {
  status: MedicalEntryStatus.SCHEDULED,
  voidedAt: null,
  itemId: { not: null },
} as const satisfies Prisma.MedicalEntryWhereInput;

/**
 * The items the animal has open scheduled care for (scheduled, not voided).
 * Recording one of these doesn't offer to schedule the next: it is already
 * planned.
 */
export const findOpenScheduledItemIds = async (
  db: Db,
  animalId: string,
): Promise<Set<string>> => {
  const rows = await db.medicalEntry.findMany({
    where: { animalId, ...OPEN_SCHEDULED_ITEM_WHERE },
    distinct: ["itemId"],
    select: { itemId: true },
  });
  return new Set(rows.flatMap((row) => row.itemId ?? []));
};

/**
 * The animal's open scheduled entries (scheduled, not voided), by item. A
 * form recording one of them as given asks whether any other is open for
 * its item.
 */
export const findOpenScheduledEntryIdsByItem = async (
  db: Db,
  animalId: string,
): Promise<Map<string, string[]>> => {
  const rows = await db.medicalEntry.findMany({
    where: { animalId, ...OPEN_SCHEDULED_ITEM_WHERE },
    orderBy: { id: "asc" },
    select: { id: true, itemId: true },
  });
  const byItem = new Map<string, string[]>();
  for (const { id, itemId } of rows) {
    if (!itemId) continue;
    byItem.set(itemId, [...(byItem.get(itemId) ?? []), id]);
  }
  return byItem;
};

/**
 * One page of the animal's entries, whatever their status, voided ones
 * included: the history is the only read that shows them all. `kinds` empty
 * means every kind.
 *
 * Newest first by the day given or, for care not given, the day due, so
 * upcoming care comes first and care given on an unknown day before intake
 * comes last. A spay/neuter exemption recorded on its own was never due, so
 * it goes by the day it was recorded, on the shelter's calendar
 * (`timeZone`). Prisma can't order by that, so the page's ids are picked in
 * SQL and the entries read by id.
 */
export const findMedicalHistoryPage = async (
  db: Db,
  animalId: string,
  options: {
    kinds: MedicalEntryKind[];
    page: number;
    perPage: number;
    timeZone: string;
  },
) => {
  const where: Prisma.MedicalEntryWhereInput = {
    animalId,
    ...(options.kinds.length > 0 && { kind: { in: options.kinds } }),
  };
  const kindFilter =
    options.kinds.length > 0
      ? Prisma.sql`AND kind::text IN (${Prisma.join(options.kinds)})`
      : Prisma.empty;
  // The shelter day a declined entry with no due day was recorded on.
  // `created_at` is stored as UTC with no zone, so it is read as UTC first,
  // then as the shelter's wall clock.
  const declinedUndueDay = Prisma.sql`CASE WHEN status::text = ${MedicalEntryStatus.DECLINED}
    THEN to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${options.timeZone}, 'YYYY-MM-DD')
    END`;
  const [total, page] = await Promise.all([
    db.medicalEntry.count({ where }),
    db.$queryRaw<{ id: string }[]>`
      SELECT id FROM medical_entries
      WHERE animal_id = ${animalId} ${kindFilter}
      ORDER BY coalesce(completed_date, due_date, ${declinedUndueDay}) DESC NULLS LAST,
        created_at DESC, id DESC
      LIMIT ${options.perPage} OFFSET ${(options.page - 1) * options.perPage}`,
  ]);
  const ids = page.map((row) => row.id);
  const rows = await db.medicalEntry.findMany({
    where: { id: { in: ids } },
    select: MEDICAL_ENTRY_DISPLAY_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const entries = ids.flatMap((id) => byId.get(id) ?? []);
  return { entries, totalPages: Math.max(1, Math.ceil(total / options.perPage)) };
};

/** The animal's completed vaccines and tests that aren't voided, newest
 * first. */
export const findVaccinesAndTests = (db: Db, animalId: string) =>
  db.medicalEntry.findMany({
    where: {
      animalId,
      status: MedicalEntryStatus.COMPLETED,
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
