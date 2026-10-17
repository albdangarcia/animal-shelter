// How the shelter-wide dose sheet is laid out: a day's slots in sections AM,
// Midday, PM and As needed, each grouped by where the animal is, as the Due
// page groups; which days it can show; and each row as the slot controls
// take it. Pure functions of the rows `medication-doses.ts` reads, the
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
import {
  parseCalendarDay,
  shiftDayKey,
  type CalendarDay,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import {
  DOSE_SHEET_PAST_DAYS,
  DOSE_SLOT_LABELS,
  DOSE_SLOT_ORDER,
} from "@/app/lib/constants/medical";
import {
  slotState,
  type DoseSlotEnds,
  type SlotState,
} from "@/app/lib/utils/medication-slots";
import { doseSlotText } from "@/app/lib/services/medication-text";
import { GROUP_RANK, groupOf, type MedicalDuePlace } from "./medical-due-groups";
import { givenAtText, type SlotView } from "./animals/medication-view";

/** A live dose recorded on the sheet's day. */
export interface DoseSheetDose {
  id: string;
  slot: DoseSlot | null;
  result: MedicationDoseResult;
  reason: string | null;
  administeredAt: Date;
  administeredById: string;
  administeredByName: string;
  reportedByFoster: boolean;
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
   * Whether the order runs that day: started, not past its end day, not
   * discontinued on or before it. An as-needed order takes a dose only then;
   * one discontinued from that day is listed for the doses given before.
   */
  runs: boolean;
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

/**
 * The days the dose sheet shows: today and the `DOSE_SHEET_PAST_DAYS` before
 * it, never a day ahead. `?day=` picks one; anything else (a day out of that
 * range, or not a day at all) shows today, and says the day asked for was
 * refused. A param given twice takes its first value.
 */
export const doseSheetDay = (
  param: string | string[] | undefined,
  today: CalendarDay,
): { day: CalendarDay; earliest: CalendarDay; refused: boolean } => {
  const earliest = shiftDayKey(today, -DOSE_SHEET_PAST_DAYS);
  const value = Array.isArray(param) ? param[0] : param;
  if (value === undefined || value === "") return { day: today, earliest, refused: false };
  const day = parseCalendarDay(value);
  if (!day || day < earliest || day > today) return { day: today, earliest, refused: true };
  return { day, earliest, refused: false };
};

/**
 * A row as a slot's controls take it: the same shape the animal's own dose
 * sheet gives its cells, so the sheet records doses with the same Give and
 * menu. A slot takes a dose while it holds none (the sheet lists a slot with
 * no dose only when the order expects it); an as-needed order while it runs.
 * The time each dose was given is written here, on the shelter's clock.
 */
export const doseSheetCell = (
  row: DoseSheetRow,
  runs: boolean,
  day: CalendarDay,
  today: CalendarDay,
  timezone: string,
): SlotView => ({
  key: `${row.order.id}:${day}:${row.slot ?? "PRN"}`,
  orderId: row.order.id,
  slotDate: day,
  slot: row.slot,
  // A slot holding a dose is no longer expected once the order stopped
  // running that day (discontinued from it).
  expected: row.slot !== null && (row.dose === null || runs),
  state: row.state,
  doses: row.doses.map((dose) => ({
    id: dose.id,
    result: dose.result,
    reason: dose.reason,
    notes: dose.notes,
    givenAt: givenAtText(dose.administeredAt, day, timezone),
    givenBy: `${dose.administeredByName}${dose.reportedByFoster ? " (foster)" : ""}`,
    voided: false,
    voidedBy: null,
    voidReason: null,
  })),
  voidedDoses: [],
  recordable: day <= today && (row.slot === null ? runs : row.dose === null),
  label: `${row.order.itemName}, ${doseSlotText({ slotDate: day, slot: row.slot })}`,
});

/** A row of the sheet with its cell, as the page renders it. */
export interface DoseSheetViewRow extends DoseSheetRow {
  cell: SlotView;
}

export interface DoseSheetViewGroup extends Omit<DoseSheetGroup, "rows"> {
  rows: DoseSheetViewRow[];
}

export interface DoseSheetViewSection extends Omit<DoseSheetSection, "groups"> {
  groups: DoseSheetViewGroup[];
}

/** The sheet for `day` as the page shows it: `doseSheetSections`, each row
 * with its cell. */
export const doseSheetView = (
  orders: DoseSheetOrder[],
  day: CalendarDay,
  { today, clock }: { today: CalendarDay; clock: ShelterClock },
  ends: DoseSlotEnds,
  timezone: string,
): DoseSheetViewSection[] => {
  const runs = new Map(orders.map((entry) => [entry.order.id, entry.runs]));
  return doseSheetSections(orders, day, clock, ends).map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      rows: group.rows.map((row) => ({
        ...row,
        cell: doseSheetCell(row, runs.get(row.order.id) ?? false, day, today, timezone),
      })),
    })),
  }));
};
