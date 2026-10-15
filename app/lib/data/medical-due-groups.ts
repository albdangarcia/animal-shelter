// How the shelter-wide due list is grouped and bucketed: pure functions of
// its rows and the shelter's today, with no Prisma import, so unit tests and
// the page can use them. The rows are read in `medical-due.ts`.

import type {
  MedicalEntryKind,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";
import type { MedicalDueEntry } from "./medical-due";

/** How many days after today the due list looks ahead. */
export const UPCOMING_DAYS = 7;

/** Where the animal is: the grouping of the due list. */
export type MedicalDuePlace =
  | {
      type: "UNIT";
      locationId: string;
      locationName: string;
      unitId: string;
      unitName: string;
    }
  | { type: "FOSTER"; fosterPersonId: string; fosterName: string }
  | { type: "NOT_HOUSED" };

export interface MedicalDueListRow {
  entry: MedicalDueEntry;
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
}

/** A spay/neuter exemption open for review, as the due list shows it. */
export interface MedicalDueReviewEntry {
  id: string;
  kind: typeof MedicalEntryKind.SURGERY;
  procedure: SurgeryProcedure;
  exemptionReason: SpayNeuterExemptionReason;
  declineReason: string | null;
  /** The day it is listed by, as care is by its due day. */
  reviewDate: CalendarDay;
}

/**
 * An exemption open for review on the due list. It has no due day of its
 * own: it falls due on its review day, and is done by scheduling the spay or
 * neuter, or recording a new exemption.
 */
export interface MedicalDueReviewRow {
  review: true;
  entry: MedicalDueReviewEntry;
  animal: MedicalDueListRow["animal"];
  place: MedicalDuePlace;
}

/** A row of the due list: scheduled care, or an exemption up for review. */
export type MedicalDueSectionRow = MedicalDueListRow | MedicalDueReviewRow;

/** The day a row falls due: care's due day, or a review's review day. */
export const dueRowDay = (row: MedicalDueSectionRow): CalendarDay =>
  "review" in row ? row.entry.reviewDate : row.entry.dueDate;

/** What a row is called: care by its name, a review as one. */
export const dueRowName = (row: MedicalDueSectionRow) =>
  "review" in row ? "Spay/neuter exemption review" : medicalEntryName(row.entry);

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
  sections: { bucket: MedicalDueBucket; rows: MedicalDueSectionRow[] }[];
}

/** Units first, then fosters, then animals not housed: the order the
 * shelter-wide lists group by place in. */
export const GROUP_RANK: Record<MedicalDuePlace["type"], number> = {
  UNIT: 0,
  FOSTER: 1,
  NOT_HOUSED: 2,
};

/** The group a place falls in: its location, its foster, or "Not housed". */
export const groupOf = (place: MedicalDuePlace) => {
  switch (place.type) {
    case "UNIT":
      return { key: `location:${place.locationId}`, title: place.locationName };
    case "FOSTER":
      return { key: `foster:${place.fosterPersonId}`, title: place.fosterName };
    case "NOT_HOUSED":
      return { key: "not-housed", title: "Not housed" };
  }
};

// Soonest due first, then by animal and name, so rows on one day read in a
// stable order. An animal's review comes after its care due the same day.
const compareRows = (a: MedicalDueSectionRow, b: MedicalDueSectionRow) =>
  dueRowDay(a).localeCompare(dueRowDay(b)) ||
  a.animal.name.localeCompare(b.animal.name) ||
  Number("review" in a) - Number("review" in b) ||
  dueRowName(a).localeCompare(dueRowName(b)) ||
  a.entry.id.localeCompare(b.entry.id);

/**
 * The due list as the page shows it: a group per location (by name), then
 * per foster (by name), then "Not housed". Inside each, Overdue, Today and
 * Upcoming, leaving out the empty ones. Exemptions up for review are
 * bucketed by their review day, as care is by its due day.
 */
export const groupMedicalDue = (
  rows: MedicalDueListRow[],
  today: CalendarDay,
  reviews: MedicalDueReviewRow[] = [],
): MedicalDueGroup[] => {
  const groups = new Map<
    string,
    { group: MedicalDueGroup; rank: number; rows: MedicalDueSectionRow[] }
  >();
  for (const row of [...rows, ...reviews]) {
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
          .filter((row) => dueBucket(dueRowDay(row), today) === bucket)
          .sort(compareRows),
      })).filter((section) => section.rows.length > 0),
    }));
};
