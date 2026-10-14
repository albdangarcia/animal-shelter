// An animal's problem list and care episodes as its Medical pages show them,
// with their change histories and what the forms offer. No auth or `next/*`
// imports, so database tests can call them; `medical-condition.data.ts`
// wraps them behind the medical permissions.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  CharacteristicCategory,
  MedicalEntryKind,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import {
  careEpisodeOrder,
  conditionSourceText,
  problemListOrder,
} from "@/app/lib/utils/problem-list";
import { findActiveVetClinics } from "../medical-catalog";

// The root client only, never a transaction's: each read selects sibling
// relations (who recorded a row, its source, its trait), which Prisma fetches
// at once, and a transaction has one connection to run them on.
type Db = typeof prisma;

// The test or exam a condition was found on, as far as naming it goes. It
// may have been voided since.
const SOURCE_ENTRY_SELECT = {
  id: true,
  kind: true,
  examType: true,
  completedDate: true,
  voidedAt: true,
  item: { select: { name: true } },
} as const satisfies Prisma.MedicalEntrySelect;

// A row's events, oldest first, with who made each.
const EVENT_SELECT = {
  id: true,
  action: true,
  before: true,
  after: true,
  createdAt: true,
  actor: { select: { name: true } },
} as const;

/** Everything a page shows about one problem-list row, and what its edit
 * form and change history need. */
export const MEDICAL_CONDITION_DISPLAY_SELECT = {
  id: true,
  animalId: true,
  type: true,
  name: true,
  status: true,
  onsetDate: true,
  resolvedDate: true,
  diagnosedBy: true,
  notes: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  sourceEntryId: true,
  sourceEntry: { select: SOURCE_ENTRY_SELECT },
  characteristicId: true,
  characteristic: { select: { name: true, deletedAt: true } },
  // The animal's traits as they stand, so a row can offer to add its own or
  // to be cited for it.
  animal: {
    select: {
      animalCharacteristics: {
        where: { removedAt: null },
        select: { characteristicId: true, sourceConditionId: true },
      },
    },
  },
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: EVENT_SELECT,
  },
} as const satisfies Prisma.MedicalConditionSelect;

export type MedicalConditionDisplay = Prisma.MedicalConditionGetPayload<{
  select: typeof MEDICAL_CONDITION_DISPLAY_SELECT;
}>;

/** Everything a page shows about one care episode, and what its forms and
 * change history need. */
export const CARE_EPISODE_DISPLAY_SELECT = {
  id: true,
  animalId: true,
  type: true,
  startDate: true,
  endDate: true,
  reason: true,
  notes: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  partnerId: true,
  partner: { select: { name: true } },
  openedBy: { select: { name: true } },
  closedBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: EVENT_SELECT,
  },
} as const satisfies Prisma.CareEpisodeSelect;

export type CareEpisodeDisplay = Prisma.CareEpisodeGetPayload<{
  select: typeof CARE_EPISODE_DISPLAY_SELECT;
}>;

/**
 * The animal's problem list, voided rows included: allergies, then active and
 * chronic conditions, then resolved rows, then voided ones.
 */
export const findProblemList = async (db: Db, animalId: string) =>
  problemListOrder(
    await db.medicalCondition.findMany({
      where: { animalId },
      select: MEDICAL_CONDITION_DISPLAY_SELECT,
    }),
  );

/**
 * The animal's care episodes, voided ones included: the open one first, then
 * the rest by start day, newest first.
 */
export const findCareEpisodes = async (db: Db, animalId: string) =>
  careEpisodeOrder(
    await db.careEpisode.findMany({
      where: { animalId },
      select: CARE_EPISODE_DISPLAY_SELECT,
    }),
  );

type EventSides = { events: { before: unknown; after: unknown }[] }[];

const idsIn = (rows: EventSides, field: string) => {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const event of row.events) {
      for (const side of [event.before, event.after]) {
        if (!side || typeof side !== "object") continue;
        const value = (side as Record<string, unknown>)[field];
        if (typeof value === "string") ids.add(value);
      }
    }
  }
  return [...ids];
};

/**
 * Names for the ids the rows' events hold, keyed by id (cuids don't collide
 * across tables): a condition's source test or exam ("Heartworm antigen test
 * of Sep 3, 2026") and its trait, and an episode's clinic. For showing an
 * event's before and after as names.
 */
export const findConditionEventNames = async (
  db: Db,
  conditions: EventSides,
  episodes: EventSides,
): Promise<Record<string, string>> => {
  const [entries, characteristics, partners] = await Promise.all([
    db.medicalEntry.findMany({
      where: { id: { in: idsIn(conditions, "sourceEntryId") } },
      select: SOURCE_ENTRY_SELECT,
    }),
    db.characteristic.findMany({
      where: { id: { in: idsIn(conditions, "characteristicId") } },
      select: { id: true, name: true },
    }),
    db.partner.findMany({
      where: { id: { in: idsIn(episodes, "partnerId") } },
      select: { id: true, name: true },
    }),
  ]);
  return Object.fromEntries([
    ...entries.map((entry) => [entry.id, conditionSourceText(entry)]),
    ...[...characteristics, ...partners].map((row) => [row.id, row.name]),
  ]);
};

/** What the problem-list and care-episode forms offer for one animal. */
export interface ConditionFormChoices {
  /** The MEDICAL characteristics a condition can stand for, by name. */
  characteristics: { id: string; name: string }[];
  /** The animal's tests and exams a condition can be found on: done, not
   * voided, newest first. */
  sources: { id: string; label: string }[];
  /** Active vet clinics, for a stay off site or vet care at a clinic. */
  vetClinics: { id: string; name: string }[];
}

export const findConditionFormChoices = async (
  db: Db,
  animalId: string,
): Promise<ConditionFormChoices> => {
  const [characteristics, sources, vetClinics] = await Promise.all([
    db.characteristic.findMany({
      where: { category: CharacteristicCategory.MEDICAL, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.medicalEntry.findMany({
      where: {
        animalId,
        kind: { in: [MedicalEntryKind.TEST, MedicalEntryKind.EXAM] },
        status: MedicalEntryStatus.COMPLETED,
        voidedAt: null,
      },
      orderBy: [
        { completedDate: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: SOURCE_ENTRY_SELECT,
    }),
    findActiveVetClinics(db),
  ]);
  return {
    characteristics,
    sources: sources.map((entry) => ({
      id: entry.id,
      label: conditionSourceText(entry),
    })),
    vetClinics,
  };
};
