// How the shelter-wide dose sheet is laid out: a day's slots in sections AM,
// Midday, PM and As needed, each grouped by where the animal is, as the Due
// page groups. Pure functions of the rows `medication-doses.ts` reads, the
// shelter's clock and the dose times, with no Prisma import, so unit tests
// and the page can use them.

import type {
  DoseSlot,
  DoseUnit,
  MedicalRoute,
  MedicationDoseResult,
  MedicationFrequency,
  Sex,
} from "@/prisma/generated/enums";
import type { CalendarDay, ShelterClock } from "@/app/lib/utils/shelter-day";
import { DOSE_SLOT_LABELS, DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";
import {
  slotState,
  type DoseSlotEnds,
  type SlotState,
} from "@/app/lib/utils/medication-slots";
import { GROUP_RANK, groupOf, type MedicalDuePlace } from "./medical-due-groups";

/** A live dose recorded on the sheet's day. */
export interface DoseSheetDose {
  id: string;
  slot: DoseSlot | null;
  result: MedicationDoseResult;
  reason: string | null;
  administeredAt: Date;
  administeredById: string;
  administeredByName: string;
  notes: string | null;
}

/** An order on the sheet's day: what it is, whose, where the animal is, the
 * slots it has that day, and the doses recorded on it. */
export interface DoseSheetOrder {
  order: {
    id: string;
    itemName: string;
    doseAmount: number;
    doseUnit: DoseUnit;
    route: MedicalRoute;
    frequency: MedicationFrequency;
    intervalDays: number | null;
    instructions: string | null;
  };
  animal: {
    id: string;
    name: string;
    species: string;
    /** What tells it from another animal of the same name. */
    sex: Sex;
    primaryColor: string;
    birthDate: string;
  };
  place: MedicalDuePlace;
  /**
   * Its slots that day, in the day's order: those it expects, and any other
   * that holds a live dose (one recorded before the order was discontinued
   * from that day). Empty for an as-needed order.
   */
  slots: DoseSlot[];
  /** The live doses of that day, in the order they were given. */
  doses: DoseSheetDose[];
}

/** One line of the sheet: a slot of an order, or an as-needed order. */
export interface DoseSheetRow {
  /** Unique on the sheet: the order and its slot. */
  key: string;
  order: DoseSheetOrder["order"];
  animal: DoseSheetOrder["animal"];
  place: MedicalDuePlace;
  /** Null for an as-needed order. */
  slot: DoseSlot | null;
  /** The slot's live dose; for an as-needed order, none. */
  dose: DoseSheetDose | null;
  /** The slot's state on the clock; null for an as-needed order. */
  state: SlotState | null;
  /** An as-needed order's doses that day; for a slot, its one dose or none. */
  doses: DoseSheetDose[];
}

export interface DoseSheetGroup {
  /** Unique within a section: the location's id, the foster's person id, or
   * "not-housed". */
  key: string;
  type: MedicalDuePlace["type"];
  title: string;
  rows: DoseSheetRow[];
}

export type DoseSheetSectionKey = DoseSlot | "PRN";

export interface DoseSheetSection {
  key: DoseSheetSectionKey;
  title: string;
  groups: DoseSheetGroup[];
}

const SECTION_ORDER: readonly DoseSheetSectionKey[] = [...DOSE_SLOT_ORDER, "PRN"];

const sectionTitle = (key: DoseSheetSectionKey) =>
  key === "PRN" ? "As needed" : DOSE_SLOT_LABELS[key];

// By animal, then medication, so an animal's rows sit together; the order's
// id keeps two orders of one medication apart.
const compareRows = (a: DoseSheetRow, b: DoseSheetRow) =>
  a.animal.name.localeCompare(b.animal.name) ||
  a.animal.id.localeCompare(b.animal.id) ||
  a.order.itemName.localeCompare(b.order.itemName) ||
  a.order.id.localeCompare(b.order.id);

/** The rows of one order on `day`: one per slot, or one for an as-needed
 * order. */
export const doseSheetRows = (
  entry: DoseSheetOrder,
  day: CalendarDay,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): DoseSheetRow[] => {
  const base = { order: entry.order, animal: entry.animal, place: entry.place };
  if (entry.order.frequency === "PRN") {
    return [
      { ...base, key: `${entry.order.id}:PRN`, slot: null, dose: null, state: null, doses: entry.doses },
    ];
  }
  return entry.slots.map((slot) => {
    const dose = entry.doses.find((candidate) => candidate.slot === slot) ?? null;
    return {
      ...base,
      key: `${entry.order.id}:${slot}`,
      slot,
      dose,
      state: slotState({ slotDate: day, slot }, dose, clock, ends),
      doses: dose ? [dose] : [],
    };
  });
};

/**
 * The sheet for `day`: a section per slot, then As needed, leaving out empty
 * ones. Inside each, a group per location (by name), then per foster (by
 * name), then "Not housed", as the Due page groups; rows by animal, then
 * medication.
 */
export const doseSheetSections = (
  orders: DoseSheetOrder[],
  day: CalendarDay,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): DoseSheetSection[] => {
  const rows = orders.flatMap((order) => doseSheetRows(order, day, clock, ends));
  return SECTION_ORDER.map((key) => {
    const groups = new Map<string, { group: DoseSheetGroup; rank: number }>();
    for (const row of rows) {
      if ((row.slot ?? "PRN") !== key) continue;
      const { key: groupKey, title } = groupOf(row.place);
      let entry = groups.get(groupKey);
      if (!entry) {
        entry = {
          group: { key: groupKey, type: row.place.type, title, rows: [] },
          rank: GROUP_RANK[row.place.type],
        };
        groups.set(groupKey, entry);
      }
      entry.group.rows.push(row);
    }
    return {
      key,
      title: sectionTitle(key),
      groups: [...groups.values()]
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            a.group.title.localeCompare(b.group.title) ||
            a.group.key.localeCompare(b.group.key),
        )
        .map(({ group }) => ({ ...group, rows: group.rows.sort(compareRows) })),
    };
  }).filter((section) => section.groups.length > 0);
};
