// The medical entry reads with no auth or `next/*` imports, so database tests
// can call them. `medical-entry.data.ts` wraps them behind MEDICAL_READ.
//
// A read that derives a fact (the latest rabies vaccine, which entries are
// current) counts only completed entries that aren't voided: scheduled care
// hasn't happened, declined care never will, and a voided entry counts for
// nothing. The due list reads scheduled entries that aren't voided. Only the
// history reads every entry, beside the problem list and care episodes.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import { MedicalEntryKind, MedicalEntryStatus } from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import type { MedicalHistoryKind } from "@/app/lib/zod-schemas/medical-entry.schemas";
import { findAnimalMedications, type AnimalMedicationOrder } from "./medication";
import {
  CARE_EPISODE_DISPLAY_SELECT,
  MEDICAL_CONDITION_DISPLAY_SELECT,
  type CareEpisodeDisplay,
  type MedicalConditionDisplay,
} from "./medical-condition";

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
  animalId: true,
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
  // The protocol that scheduled it, by its name now.
  protocolStep: { select: { protocol: { select: { name: true } } } },
  vetPartnerId: true,
  vetPartner: { select: { name: true } },
  administeredBy: { select: { name: true } },
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  // Given by a foster, or recorded from a foster's report of an outside vet
  // visit (which then names the report).
  reportedByFoster: true,
  vetReport: { select: { visitDate: true } },
  // Its paperwork: live documents only, oldest upload first. A voided one is
  // on the Documents page, struck through.
  documents: {
    where: { voidedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, type: true },
  },
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
      // The exam that found it, which may since have been voided.
      foundOnExam: {
        select: { examType: true, completedDate: true, voidedAt: true },
      },
    },
  },
  microchip: { select: { brand: true } },
  exam: {
    select: {
      overallResult: true,
      reproductiveStatus: true,
      // In the code's order of systems once read: the database can't sort
      // by it.
      findings: { select: { bodySystem: true, status: true, notes: true } },
      // Read live, deleted or not: the exam shows what the vitals entry
      // holds now, or that it was deleted.
      vitalsLog: {
        select: {
          recordedAt: true,
          weightGrams: true,
          temperatureC: true,
          bodyConditionScore: true,
          deletedAt: true,
        },
      },
    },
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

/** One row of History: an entry, a problem-list row or a care episode. */
export type MedicalHistoryItem =
  | { source: "ENTRY"; id: string; entry: MedicalEntryDisplay }
  | { source: "CONDITION"; id: string; condition: MedicalConditionDisplay }
  | { source: "EPISODE"; id: string; episode: CareEpisodeDisplay }
  | { source: "ORDER"; id: string; order: AnimalMedicationOrder };

/**
 * One page of the animal's history: its entries, whatever their status, its
 * problem-list rows, its care episodes and its medication orders, voided ones
 * included. History is the only read that shows them all. `kinds` filters by
 * entry kind and by CONDITION, CARE_EPISODE and MEDICATION; empty means
 * everything.
 *
 * Newest first by the day each is about. An entry goes by the day given or,
 * for care not given, the day due, so upcoming care comes first and care
 * given on an unknown day before intake comes last. A spay/neuter exemption
 * recorded on its own was never due, so it goes by the day it was recorded,
 * on the shelter's calendar (`timeZone`). A condition goes by its onset, or
 * the day it was recorded when it has none; an episode and an order by
 * their start. Prisma can't order across tables, so the page's ids are picked
 * in SQL and the rows read by id. `orderNames` are the names the orders'
 * events and doses hold.
 *
 * The root client only: the rows select sibling relations, which Prisma
 * fetches at once.
 */
export const findMedicalHistoryPage = async (
  db: typeof prisma,
  animalId: string,
  options: {
    kinds: MedicalHistoryKind[];
    page: number;
    perPage: number;
    timeZone: string;
  },
): Promise<{
  items: MedicalHistoryItem[];
  totalPages: number;
  orderNames: Record<string, string>;
}> => {
  const all = options.kinds.length === 0;
  const entryKinds = options.kinds.filter((kind): kind is MedicalEntryKind =>
    Object.values(MedicalEntryKind).includes(kind as MedicalEntryKind),
  );
  const withEntries = all || entryKinds.length > 0;
  const withConditions = all || options.kinds.includes("CONDITION");
  const withEpisodes = all || options.kinds.includes("CARE_EPISODE");
  const withOrders = all || options.kinds.includes("MEDICATION");

  // The shelter day a row was recorded on. `created_at` is stored as UTC with
  // no zone, so it is read as UTC first, then as the shelter's wall clock.
  const recordedDay = Prisma.sql`to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${options.timeZone}, 'YYYY-MM-DD')`;
  const branches: Prisma.Sql[] = [];
  if (withEntries) {
    const kindFilter = all
      ? Prisma.empty
      : Prisma.sql`AND kind::text IN (${Prisma.join(entryKinds)})`;
    branches.push(Prisma.sql`
      SELECT 'ENTRY' AS source, id, created_at,
        coalesce(completed_date, due_date,
          CASE WHEN status::text = ${MedicalEntryStatus.DECLINED} THEN ${recordedDay} END) AS day
      FROM medical_entries WHERE animal_id = ${animalId} ${kindFilter}`);
  }
  if (withConditions) {
    branches.push(Prisma.sql`
      SELECT 'CONDITION' AS source, id, created_at, coalesce(onset_date, ${recordedDay}) AS day
      FROM medical_conditions WHERE animal_id = ${animalId}`);
  }
  if (withEpisodes) {
    branches.push(Prisma.sql`
      SELECT 'EPISODE' AS source, id, created_at, start_date AS day
      FROM care_episodes WHERE animal_id = ${animalId}`);
  }
  if (withOrders) {
    branches.push(Prisma.sql`
      SELECT 'ORDER' AS source, id, created_at, start_date AS day
      FROM medication_orders WHERE animal_id = ${animalId}`);
  }

  const [entryCount, conditionCount, episodeCount, orderCount, page] = await Promise.all([
    withEntries
      ? db.medicalEntry.count({
          where: { animalId, ...(!all && { kind: { in: entryKinds } }) },
        })
      : 0,
    withConditions ? db.medicalCondition.count({ where: { animalId } }) : 0,
    withEpisodes ? db.careEpisode.count({ where: { animalId } }) : 0,
    withOrders ? db.medicationOrder.count({ where: { animalId } }) : 0,
    db.$queryRaw<{ source: MedicalHistoryItem["source"]; id: string }[]>`
      SELECT source, id FROM (${Prisma.join(branches, " UNION ALL ")}) AS history
      ORDER BY day DESC NULLS LAST, created_at DESC, id DESC
      LIMIT ${options.perPage} OFFSET ${(options.page - 1) * options.perPage}`,
  ]);
  const idsOf = (source: MedicalHistoryItem["source"]) =>
    page.filter((row) => row.source === source).map((row) => row.id);
  const [entries, conditions, episodes, medications] = await Promise.all([
    db.medicalEntry.findMany({
      where: { id: { in: idsOf("ENTRY") } },
      select: MEDICAL_ENTRY_DISPLAY_SELECT,
    }),
    db.medicalCondition.findMany({
      where: { id: { in: idsOf("CONDITION") } },
      select: MEDICAL_CONDITION_DISPLAY_SELECT,
    }),
    db.careEpisode.findMany({
      where: { id: { in: idsOf("EPISODE") } },
      select: CARE_EPISODE_DISPLAY_SELECT,
    }),
    findAnimalMedications(db, animalId, { orderIds: idsOf("ORDER") }),
  ]);
  const byId = new Map<string, MedicalHistoryItem>([
    ...entries.map((entry) => [entry.id, { source: "ENTRY", id: entry.id, entry }] as const),
    ...conditions.map(
      (condition) =>
        [condition.id, { source: "CONDITION", id: condition.id, condition }] as const,
    ),
    ...episodes.map(
      (episode) => [episode.id, { source: "EPISODE", id: episode.id, episode }] as const,
    ),
    ...medications.orders.map(
      (order) => [order.id, { source: "ORDER", id: order.id, order }] as const,
    ),
  ]);
  const total = entryCount + conditionCount + episodeCount + orderCount;
  return {
    items: page.flatMap((row) => byId.get(row.id) ?? []),
    totalPages: Math.max(1, Math.ceil(total / options.perPage)),
    orderNames: medications.names,
  };
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
const ID_FIELDS = ["itemId", "vetPartnerId", "administeredById", "protocolStepId"] as const;

/**
 * Names for every item, partner and person id the entries' events mention,
 * keyed by id (cuids don't collide across tables), and for each protocol
 * step, its protocol's name. For showing an event's before and after as
 * names.
 */
export const findEventNames = async (
  db: Db,
  entries: { events: { before: unknown; after: unknown }[] }[],
): Promise<Record<string, string>> => {
  const ids = {
    itemId: new Set<string>(),
    vetPartnerId: new Set<string>(),
    administeredById: new Set<string>(),
    protocolStepId: new Set<string>(),
  };
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
  const [items, partners, people, steps] = await Promise.all([
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
    db.medicalProtocolStep.findMany({
      where: { id: { in: [...ids.protocolStepId] } },
      select: { id: true, protocol: { select: { name: true } } },
    }),
  ]);
  return Object.fromEntries([
    ...[...items, ...partners, ...people].map((row) => [row.id, row.name]),
    ...steps.map((step) => [step.id, step.protocol.name]),
  ]);
};
