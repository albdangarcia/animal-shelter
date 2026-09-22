// The calendar day type, its parse boundaries, and day arithmetic.
//
// A day is a `yyyy-MM-dd` string, not an instant: it has no time of day and
// belongs to no timezone, so every viewer reads the same value. The rule, the
// alternatives that were rejected, and which columns hold days are written up
// in docs/calendar-days.md.
//
// The shelter's timezone appears here for one job only — deciding which day a
// given instant falls on, which is how "today" is answered and how a genuine
// timestamp is converted to a day when one is needed.

import { format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A calendar day, as `yyyy-MM-dd`.
 *
 * The brand is what stops an arbitrary string standing in for one. Values are
 * parsed into it at the edges where unknown input becomes a day — a form
 * submission, "today", and a read from the database — and nothing downstream
 * re-validates, so a function taking a `CalendarDay` can trust it.
 */
export type CalendarDay = string & { readonly __brand: unique symbol };

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses unknown input into a day, or null when it is not one. Rejects
 * anything that is not exactly `yyyy-MM-dd`, and any date that does not exist
 * (`2026-02-30` rolls over, so the round-trip catches it).
 */
export const parseCalendarDay = (value: unknown): CalendarDay | null => {
  if (typeof value !== "string" || !DAY_SHAPE.test(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "yyyy-MM-dd") === value
    ? (value as CalendarDay)
    : null;
};

/**
 * The same parse for a value whose source already guarantees the shape — a
 * day-valued column, or a literal. Throws rather than returning null, because
 * a failure means the column's invariant is broken and no caller has anything
 * sensible to do about it.
 */
export const calendarDay = (value: string): CalendarDay => {
  const day = parseCalendarDay(value);
  if (day === null) {
    throw new Error(`Not a calendar day: ${JSON.stringify(value)}`);
  }
  return day;
};

/**
 * The day `date` falls on in the shelter's timezone.
 *
 * This is how "today" is answered, and the one honest way to turn a genuine
 * timestamp into a day. Anywhere it appears, an instant is being converted on
 * purpose.
 */
export const shelterDayKey = (date: Date, timezone: string): CalendarDay =>
  formatInTimeZone(date, timezone, "yyyy-MM-dd") as CalendarDay;

/** Today, on the shelter's calendar. */
export const shelterToday = (
  timezone: string,
  now: Date = new Date(),
): CalendarDay =>
  shelterDayKey(now, timezone);

/**
 * The instant a day begins in the shelter's timezone.
 *
 * The inverse of `shelterDayKey`, for the places a day has to be ordered or
 * compared against real timestamps. A day is the wider truth, so going this
 * way invents a time of day that was never recorded — do it only where an
 * instant is genuinely required, and say why at the call site.
 */
export const startOfShelterDay = (day: CalendarDay, timezone: string): Date =>
  fromZonedTime(`${day} 00:00:00`, timezone);

/** A day as it reads on a page, e.g. "Sep 1, 2026". */
export const formatShelterDay = (day: CalendarDay): string =>
  format(parseISO(day), "MMM d, yyyy");

/**
 * `formatShelterDay` for a value that may be missing, or that arrives from
 * somewhere with no day type to lean on — a table cell reading an untyped
 * column value. Missing reads "N/A"; anything that is not a day reads
 * "Invalid Date" rather than throwing a whole table into its error boundary.
 */
export const formatShelterDayOrNA = (
  value: string | null | undefined,
): string => {
  if (value == null) return "N/A";
  const day = parseCalendarDay(value);
  return day === null ? "Invalid Date" : formatShelterDay(day);
};

// A day as a count of days since the epoch. Read as UTC so the count is exact
// and cannot be moved by the timezone or DST rules of the machine running this.
//
// Built with `setUTCFullYear` rather than `Date.UTC`, which reads a year of 0
// to 99 as 1900 to 1999 — so a four-digit year in that range would silently
// land nineteen centuries away.
const dayNumber = (day: CalendarDay): number => {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, date);
  return utc.getTime() / MS_PER_DAY;
};

/** The day `days` after (or, if negative, before) `day`. */
export const shiftDayKey = (day: CalendarDay, days: number): CalendarDay =>
  new Date((dayNumber(day) + days) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10) as CalendarDay;

/** How many of `days` fall on each day, keyed by the day. */
export const countByShelterDay = (
  days: Iterable<CalendarDay>,
): Map<CalendarDay, number> => {
  const counts = new Map<CalendarDay, number>();
  for (const day of days) {
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
};

/** Whole days between two days, never negative. */
export const shelterDaysBetweenKeys = (
  since: CalendarDay,
  now: CalendarDay,
): number => Math.max(0, dayNumber(now) - dayNumber(since));

/** Whole days between two instants on the shelter's calendar, never negative. */
export const shelterDaysBetween = (
  since: Date,
  now: Date,
  timezone: string,
): number =>
  shelterDaysBetweenKeys(
    shelterDayKey(since, timezone),
    shelterDayKey(now, timezone),
  );
