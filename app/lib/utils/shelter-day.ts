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
const MS_PER_HOUR = 60 * 60 * 1000;

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

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * What the clock in `timezone` reads at `at`, part by part, with the year
 * counted from 1 BC as year 0. Read through `Intl` with the era: the date-fns
 * formatters have no year zero, so the day before 0001-01-01 would read as
 * year 1.
 */
const wallClockParts = (at: number, timezone: string) => {
  let wallClock = wallClockFormats.get(timezone);
  if (!wallClock) {
    wallClock = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      fractionalSecondDigits: 3,
    });
    wallClockFormats.set(timezone, wallClock);
  }
  const part = Object.fromEntries(
    wallClock.formatToParts(at).map(({ type, value }) => [type, value]),
  );
  return {
    year: part.era === "BC" ? 1 - Number(part.year) : Number(part.year),
    month: Number(part.month),
    day: Number(part.day),
    hour: Number(part.hour),
    minute: Number(part.minute),
    second: Number(part.second),
    millisecond: Number(part.fractionalSecond),
  };
};

/** What the clock in `timezone` reads at `at`, as the UTC instant that reads
 * the same. */
const wallClockAsUtc = (at: number, timezone: string): number => {
  const part = wallClockParts(at, timezone);
  // `setUTCFullYear`, not `Date.UTC`, which reads years 0 to 99 as 1900s.
  const utc = new Date(0);
  utc.setUTCFullYear(part.year, part.month - 1, part.day);
  utc.setUTCHours(part.hour, part.minute, part.second, part.millisecond);
  return utc.getTime();
};

/**
 * The shelter's wall clock: the day it is and the time it reads, as
 * `"HH:mm"`. A dose slot's window ends at a time on that clock, so whether a
 * slot has ended is a comparison of a day and a time as strings, and no
 * instant is built from a slot: a skipped or repeated hour can't misplace
 * one. During a repeated hour the clock reads the same time twice, as a
 * clock on the wall does.
 */
export interface ShelterClock {
  day: CalendarDay;
  time: string;
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** What the shelter's clock reads at `now`. Its day is `shelterToday`'s. */
export const shelterClock = (now: Date, timezone: string): ShelterClock => {
  const part = wallClockParts(now.getTime(), timezone);
  return {
    day: `${pad(part.year, 4)}-${pad(part.month)}-${pad(part.day)}` as CalendarDay,
    time: `${pad(part.hour)}:${pad(part.minute)}`,
  };
};

/**
 * One reading of the shelter's time: the instant, today, and the clock, all
 * from `now`, so today is always the clock's day. Code that needs more than
 * one of them takes them from one reading: two reads either side of midnight
 * would disagree.
 */
export interface ShelterNow {
  now: Date;
  today: CalendarDay;
  clock: ShelterClock;
}

export const shelterNow = (now: Date, timezone: string): ShelterNow => {
  const clock = shelterClock(now, timezone);
  return { now, today: clock.day, clock };
};

/**
 * The instant a day begins in the shelter's timezone.
 *
 * The inverse of `shelterDayKey`, for the places a day has to be ordered or
 * compared against real timestamps. A day is the wider truth, so going this
 * way invents a time of day that was never recorded — do it only where an
 * instant is genuinely required, and say why at the call site.
 *
 * Usually that is 00:00 on the day. Where the clock changed near midnight it
 * isn't: a day whose 00:00 was skipped (Santiago, Havana and Beirut spring
 * forward at midnight) begins when the jump lands; a day whose 00:00 came
 * twice begins at the first; old offsets changed by seconds. A date skipped
 * whole reads as the start of the next day that happened.
 */
export const startOfShelterDay = (day: CalendarDay, timezone: string): Date => {
  // How far the clock is from UTC at an instant, read off the clock itself.
  const offsetAt = (at: number) => wallClockAsUtc(at, timezone) - at;
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  const midnight = fromZonedTime(`${day} 00:00:00`, timezone).getTime();
  // The usual case: it reads exactly 00:00 on the day, and the clock didn't
  // change in the day before it, so no earlier instant was on the day.
  const offset = offsetAt(midnight);
  if (midnight + offset === midnightUtc && offsetAt(midnight - MS_PER_DAY) === offset) {
    return new Date(midnight);
  }
  // Otherwise find where the clock changed within a day either side of
  // midnight (no clock is a day from UTC). Between two changes the offset
  // holds, so the clock reaches the day at the later of the stretch's start
  // and the instant its offset puts at 00:00; the first stretch where that
  // falls inside it is where the day begins.
  const from = midnightUtc - MS_PER_DAY;
  const to = midnightUtc + MS_PER_DAY;
  const bounds = [from];
  for (let hour = from; hour < to; hour += MS_PER_HOUR) {
    // A clock changes at most once an hour, so a change in this hour is the
    // first instant whose offset differs from its start's.
    let before = hour;
    let changed = hour + MS_PER_HOUR;
    if (offsetAt(before) === offsetAt(changed)) continue;
    while (changed - before > 1) {
      const middle = before + Math.floor((changed - before) / 2);
      if (offsetAt(middle) === offsetAt(hour)) before = middle;
      else changed = middle;
    }
    bounds.push(changed);
  }
  bounds.push(to);
  for (let i = 0; i < bounds.length - 1; i++) {
    const begins = Math.max(bounds[i], midnightUtc - offsetAt(bounds[i]));
    if (begins < bounds[i + 1]) return new Date(begins);
  }
  // Unreachable: by `to` every clock reads the day or later.
  return new Date(to);
};

/**
 * The instant the shelter's clock reads `time` (`"HH:mm"`) on `day`: when a
 * dose was given, entered as a day and a time of day. A time the clock
 * skipped (the hour it springs forward over) reads as the moment the jump
 * lands; a time it read twice (the hour it falls back over), as the first.
 */
export const shelterInstant = (day: CalendarDay, time: string, timezone: string): Date => {
  // The wall clock as if it were UTC, and how far the clock is from UTC at an
  // instant, read off the clock itself.
  const target = Date.parse(`${day}T${time}:00Z`);
  const offsetAt = (at: number) => wallClockAsUtc(at, timezone) - at;
  // The offsets in force within a day either side: a clock changes far less
  // often than that, so these are the one or two it could read the time at.
  const candidates = [
    ...new Set([
      offsetAt(target - MS_PER_DAY),
      offsetAt(target),
      offsetAt(target + MS_PER_DAY),
    ]),
  ]
    .map((offset) => target - offset)
    .sort((a, b) => a - b);
  const reading = candidates.find((at) => wallClockAsUtc(at, timezone) === target);
  if (reading !== undefined) return new Date(reading);
  // Skipped: before the jump the clock is short of the time, after it past
  // it. The jump is the first instant at the later offset.
  let before = candidates[0];
  let after = candidates[candidates.length - 1];
  const offsetBefore = offsetAt(before);
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2);
    if (offsetAt(middle) === offsetBefore) before = middle;
    else after = middle;
  }
  return new Date(after);
};

/** A time of day, `"HH:mm"`, as it reads on a page: "8:00 PM", "12:30 AM". */
export const formatTimeOfDay = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);
  const half = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)} ${half}`;
};

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
