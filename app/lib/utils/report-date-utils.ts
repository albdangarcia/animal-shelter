// Report date boundaries are computed in a single configured timezone
// (SHELTER_TIMEZONE). Timestamps are stored in UTC, but a shelter's "June"
// means June in the shelter's local days — so every report boundary is resolved
// in one configured zone. This guarantees all viewers see identical numbers
// regardless of their own browser/OS timezone.

import { format, differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { SHELTER_TIMEZONE } from "../constants/constants";

// Widest window a report may cover; wider requests are clamped, never errored.
const MAX_RANGE_DAYS = 731;

export type ReportRange = {
  gte: Date; // UTC instant: start of `from` day in shelter tz
  lt: Date; // UTC instant: start of the day AFTER `to` in shelter tz (exclusive)
  fromLabel: string; // "yyyy-MM-dd" actually used (after defaults/clamping)
  toLabel: string;
};

/** Today's date as `yyyy-MM-dd`, reckoned in the shelter timezone. */
function todayLabel(): string {
  return formatInTimeZone(new Date(), SHELTER_TIMEZONE, "yyyy-MM-dd");
}

/** January 1 of the current shelter-timezone year, as `yyyy-MM-dd`. */
function startOfYearLabel(): string {
  const year = formatInTimeZone(new Date(), SHELTER_TIMEZONE, "yyyy");
  return `${year}-01-01`;
}

/**
 * Parses a `yyyy-MM-dd` string into a plain calendar Date (local midnight, used
 * only for day arithmetic/labeling), returning null if absent, malformed, or a
 * non-existent calendar date (e.g. "2026-02-30").
 */
function parseLabel(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parseISO(value);
  if (!isValid(parsed)) return null;
  // Reject roll-over dates: the round-tripped label must match the input.
  if (format(parsed, "yyyy-MM-dd") !== value) return null;
  return parsed;
}

/** The UTC instant at which `yyyy-MM-dd` begins (midnight) in the shelter tz. */
function zonedDayStart(label: string): Date {
  return fromZonedTime(`${label} 00:00:00`, SHELTER_TIMEZONE);
}

function addDaysLabel(label: string, days: number): string {
  const d = parseISO(label);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/**
 * Resolves raw `from`/`to` URL params into a concrete, timezone-anchored range.
 *
 *  - Missing `to` → today; missing `from` → Jan 1 of the current year (YTD).
 *  - `from > to` is swapped rather than errored.
 *  - Spans wider than 731 days clamp `from` to `to - 731 days`.
 *  - Unparseable input falls back to the defaults; this function never throws.
 *
 * The returned `gte`/`lt` are UTC instants ready for Prisma; `lt` is exclusive
 * (start of the day after `to`) so no event is double-counted at midnight.
 */
export function resolveReportRange(from?: string, to?: string): ReportRange {
  let fromLabel = parseLabel(from) ? from! : startOfYearLabel();
  let toLabel = parseLabel(to) ? to! : todayLabel();

  // Swap reversed ranges.
  if (fromLabel > toLabel) {
    [fromLabel, toLabel] = [toLabel, fromLabel];
  }

  // Clamp overly wide windows, holding `to` fixed.
  if (differenceInCalendarDays(parseISO(toLabel), parseISO(fromLabel)) > MAX_RANGE_DAYS) {
    fromLabel = addDaysLabel(toLabel, -MAX_RANGE_DAYS);
  }

  return {
    gte: zonedDayStart(fromLabel),
    lt: zonedDayStart(addDaysLabel(toLabel, 1)),
    fromLabel,
    toLabel,
  };
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
