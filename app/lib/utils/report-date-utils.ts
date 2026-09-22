// Report boundaries are two calendar days, inclusive at both ends. A day-valued
// column compares against them as plain strings, because `yyyy-MM-dd` is
// fixed-width and zero-padded — see docs/calendar-days.md.
//
// The shelter's timezone is involved in one thing only: deciding which day
// "today" is, for the range that has no explicit end.

import { parseISO, format } from "date-fns";
import {
  parseCalendarDay,
  shiftDayKey,
  shelterDaysBetweenKeys,
  type CalendarDay,
} from "./shelter-day";

// Widest window a report may cover; wider requests are clamped, never errored.
const MAX_RANGE_DAYS = 731;

export type ReportRange = {
  /** The first day counted, after defaults and clamping. */
  fromLabel: CalendarDay;
  /** The last day counted. Inclusive. */
  toLabel: CalendarDay;
};

/** January 1 of the current year on the shelter's calendar. */
function startOfYearDay(today: CalendarDay): CalendarDay {
  return `${today.slice(0, 4)}-01-01` as CalendarDay;
}

/**
 * Resolves raw `from`/`to` URL params into a concrete day range.
 *
 *  - Missing `to` → today; missing `from` → Jan 1 of the current year (YTD).
 *  - `from > to` is swapped rather than errored.
 *  - Spans wider than 731 days clamp `from` to `to - 731 days`.
 *  - Unparseable input falls back to the defaults; this function never throws.
 *
 * Both ends are inclusive: a report for a single day asks for that day twice.
 */
export function resolveReportRange(
  from: string | undefined,
  to: string | undefined,
  today: CalendarDay,
): ReportRange {
  let fromDay = parseCalendarDay(from) ?? startOfYearDay(today);
  let toDay = parseCalendarDay(to) ?? today;

  // Swap reversed ranges.
  if (fromDay > toDay) {
    [fromDay, toDay] = [toDay, fromDay];
  }

  // Clamp overly wide windows, holding `to` fixed.
  if (shelterDaysBetweenKeys(fromDay, toDay) > MAX_RANGE_DAYS) {
    fromDay = shiftDayKey(toDay, -MAX_RANGE_DAYS);
  }

  return { fromLabel: fromDay, toLabel: toDay };
}

/**
 * Human-readable label for a range, e.g. `"Jan 1 – Jul 4, 2026"`. When the two
 * dates fall in different years the year is shown on both ends.
 */
export function formatRangeLabel(range: ReportRange): string {
  const fromDate = parseISO(range.fromLabel);
  const toDate = parseISO(range.toLabel);
  const sameYear = fromDate.getFullYear() === toDate.getFullYear();

  const fromStr = format(fromDate, sameYear ? "MMM d" : "MMM d, yyyy");
  const toStr = format(toDate, "MMM d, yyyy");
  return `${fromStr} – ${toStr}`;
}
