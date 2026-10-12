// How the shelter-wide due list is grouped and bucketed: pure functions of
// its rows and the shelter's today, with no Prisma import, so unit tests and
// the page can use them. The rows are read in `medical-due.ts`.

import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { MedicalDueEntry } from "./medical-due";

/** How many days after today the due list looks ahead. */
export const UPCOMING_DAYS = 7;

/** Where the animal is: the grouping of the due list. */
export type MedicalDuePlace =
  | {
      type: "UNIT";
      locationId: string;
      locationName: string;
      unitName: string;
    }
  | { type: "FOSTER"; fosterPersonId: string; fosterName: string }
  | { type: "NOT_HOUSED" };

export interface MedicalDueListRow {
  entry: MedicalDueEntry;
  animal: { id: string; name: string; species: string };
  place: MedicalDuePlace;
}

export type MedicalDueBucket = "OVERDUE" | "TODAY" | "UPCOMING";

/** Overdue is due before the shelter's today; due today is today itself. */
export const dueBucket = (
  dueDate: CalendarDay,
  today: CalendarDay,
): MedicalDueBucket =>
  dueDate < today ? "OVERDUE" : dueDate === today ? "TODAY" : "UPCOMING";

const BUCKET_ORDER: MedicalDueBucket[] = ["OVERDUE", "TODAY", "UPCOMING"];

export interface MedicalDueGroup {
  /** Unique across groups: the location's id, the foster's person id, or
   * "not-housed". */
  key: string;
  type: MedicalDuePlace["type"];
  title: string;
  /** Only the buckets with rows, in the order Overdue, Today, Upcoming. */
  sections: { bucket: MedicalDueBucket; rows: MedicalDueListRow[] }[];
}

const GROUP_RANK: Record<MedicalDuePlace["type"], number> = {
  UNIT: 0,
  FOSTER: 1,
  NOT_HOUSED: 2,
};

const groupOf = (place: MedicalDuePlace) => {
  switch (place.type) {
    case "UNIT":
      return { key: `location:${place.locationId}`, title: place.locationName };
    case "FOSTER":
      return { key: `foster:${place.fosterPersonId}`, title: place.fosterName };
    case "NOT_HOUSED":
      return { key: "not-housed", title: "Not housed" };
  }
};

// Soonest due first, then by animal and item, so rows on one day read in a
// stable order.
const compareRows = (a: MedicalDueListRow, b: MedicalDueListRow) =>
  a.entry.dueDate.localeCompare(b.entry.dueDate) ||
  a.animal.name.localeCompare(b.animal.name) ||
  a.entry.item.name.localeCompare(b.entry.item.name) ||
  a.entry.id.localeCompare(b.entry.id);

/**
 * The due list as the page shows it: a group per location (by name), then
 * per foster (by name), then "Not housed". Inside each, Overdue, Today and
 * Upcoming, leaving out the empty ones.
 */
export const groupMedicalDue = (
  rows: MedicalDueListRow[],
  today: CalendarDay,
): MedicalDueGroup[] => {
  const groups = new Map<
    string,
    { group: MedicalDueGroup; rank: number; rows: MedicalDueListRow[] }
  >();
  for (const row of rows) {
    const { key, title } = groupOf(row.place);
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        group: { key, type: row.place.type, title, sections: [] },
        rank: GROUP_RANK[row.place.type],
        rows: [],
      };
      groups.set(key, entry);
    }
    entry.rows.push(row);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.group.title.localeCompare(b.group.title) ||
        a.group.key.localeCompare(b.group.key),
    )
    .map(({ group, rows: groupRows }) => ({
      ...group,
      sections: BUCKET_ORDER.map((bucket) => ({
        bucket,
        rows: groupRows
          .filter((row) => dueBucket(row.entry.dueDate, today) === bucket)
          .sort(compareRows),
      })).filter((section) => section.rows.length > 0),
    }));
};
