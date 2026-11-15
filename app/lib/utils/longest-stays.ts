// The dashboard's "Longest stays" card: the length-of-stay report's own
// worklist and in-care counts, cut to the first few. Pure, with no Prisma or
// auth imports, so it is unit-tested (longest-stays.test.ts). The order, what
// counts as in care and the 90-day line are `summarizeLengthOfStay`'s, never
// copied here, so the card's rows are always the report's first rows.

import {
  summarizeLengthOfStay,
  type AnimalStayHistory,
  type LongestStayRow,
} from "./length-of-stay";
import { resolveReportRange } from "./report-date-utils";
import type { CalendarDay } from "./shelter-day";

/** How many animals the card names. */
export const LONGEST_STAYS_SHOWN = 5;

export type LongestStays = {
  /** Every animal in care now, as the report's "Animals in care now". */
  inCareNow: number;
  /** As the report's "In care over 90 days". */
  over90: number;
  /** The report's first `LONGEST_STAYS_SHOWN` rows, in its order. */
  rows: LongestStayRow[];
};

/**
 * The card's numbers from every animal's history, as of `today`. The report's
 * default range is passed only because `summarizeLengthOfStay` takes one: the
 * worklist and its counts are "as of now" whatever the range.
 */
export function summarizeLongestStays(
  animals: readonly AnimalStayHistory[],
  today: CalendarDay,
): LongestStays {
  const { inCareNow, over90, worklist } = summarizeLengthOfStay(
    animals,
    resolveReportRange(undefined, undefined, today),
    today,
  );
  return {
    inCareNow,
    over90,
    rows: worklist.slice(0, LONGEST_STAYS_SHOWN),
  };
}

/** "0 days", "1 day", "12 days". */
export function stayDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The first half of the summary line: "12 in care". */
export function inCareLine(inCareNow: number): string {
  return `${inCareNow} in care`;
}

/** The second half: "3 over 90 days", or "none over 90 days". */
export function over90Line(over90: number): string {
  return `${over90 === 0 ? "none" : over90} over 90 days`;
}

/** The card's headline when nobody is in care. */
export const NO_ANIMALS_IN_CARE = "No animals in care";

/** "returned · 40 days in all" when the animal's days in all differ from its
 *  current stay (the report's `hasPriorStays`); otherwise `null`, where the
 *  report's table shows "same". An earlier stay of 0 days (in and out on one
 *  day) adds nothing to the days in all, so it shows no note: the note is
 *  there to give the days in all, and they would repeat the current stay. */
export function returnedNote(row: LongestStayRow): string | null {
  return row.hasPriorStays
    ? `returned · ${stayDays(row.cumulativeDays)} in all`
    : null;
}
