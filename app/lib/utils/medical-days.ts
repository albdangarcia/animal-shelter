// Day arithmetic and derived facts for medical entries. Pure: no Prisma and no
// clock, so the unit tests can pin every branch.

import { shiftDayKey, type CalendarDay } from "@/app/lib/utils/shelter-day";

const pad = (value: number) => String(value).padStart(2, "0");

// The last day of a month, read in UTC so the machine's timezone can't move it.
// Month is 1-based; day 0 of the next month is the last of this one.
const daysInMonth = (year: number, month: number) => {
  const utc = new Date(0);
  utc.setUTCFullYear(year, month, 0);
  return utc.getUTCDate();
};

/**
 * The day `months` calendar months after `day`, clamped to the end of the
 * month when that month is shorter: Jan 31 plus one month is Feb 28, or Feb 29
 * in a leap year. This is how a vaccine's duration is counted, so a dose given
 * on the 31st never runs into the month after.
 */
export const addCalendarMonths = (
  day: CalendarDay,
  months: number,
): CalendarDay => {
  const [year, month, date] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDate = Math.min(date, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${pad(targetMonth)}-${pad(targetDate)}` as CalendarDay;
};

export type RabiesStatus =
  | { status: "VALID"; validUntilDate: CalendarDay }
  | { status: "EXPIRED"; validUntilDate: CalendarDay }
  /** A rabies vaccine is on record, but not the day it was given. */
  | { status: "DATE_UNKNOWN" }
  | { status: "NONE" };

/**
 * Whether the animal's rabies vaccination is current, from its latest rabies
 * vaccine that isn't voided (null when there is none). Valid through the
 * valid-until day itself.
 */
export const rabiesStatus = (
  latest: { validUntilDate: CalendarDay | null } | null,
  today: CalendarDay,
): RabiesStatus => {
  if (!latest) return { status: "NONE" };
  const { validUntilDate } = latest;
  if (!validUntilDate) return { status: "DATE_UNKNOWN" };
  return validUntilDate >= today
    ? { status: "VALID", validUntilDate }
    : { status: "EXPIRED", validUntilDate };
};

/**
 * How far ahead care can be scheduled, in years. Far enough for a three-year
 * rabies booster; further than this is more likely a mistyped year.
 */
export const MAX_SCHEDULE_AHEAD_YEARS = 5;

/**
 * The longest repeat interval a catalog item can have: five years of 365
 * days, which never passes the scheduling ceiling, so the next dose suggested
 * from care given today can always be scheduled. An item that repeats less
 * often than that can't have its next dose planned anyway.
 */
export const MAX_REPEAT_INTERVAL_DAYS = MAX_SCHEDULE_AHEAD_YEARS * 365;

/** The last day care can be scheduled for when today is `today`. */
export const latestDueDate = (today: CalendarDay): CalendarDay =>
  addCalendarMonths(today, MAX_SCHEDULE_AHEAD_YEARS * 12);

/**
 * Why `dueDate` can't be a due day when today is `today`, or null when it
 * can. Care is scheduled from today on: a day already past would be overdue
 * the moment it was saved. A spay/neuter exemption's review day follows the
 * same rule, and passes its own `label`.
 */
export const dueDateIssue = (
  dueDate: CalendarDay,
  today: CalendarDay,
  label = "The due date",
): string | null => {
  if (dueDate < today) return `${label} can't be in the past.`;
  if (dueDate > latestDueDate(today)) {
    return `${label} can't be more than ${MAX_SCHEDULE_AHEAD_YEARS} years from today.`;
  }
  return null;
};

/**
 * The day to suggest for the next dose of an item that repeats every
 * `intervalDays`, after one given on `completedDate`. Never before today: if
 * the next one should already have been given, it is due now.
 */
export const nextDueDate = (
  completedDate: CalendarDay,
  intervalDays: number,
  today: CalendarDay,
): CalendarDay => {
  const next = shiftDayKey(completedDate, intervalDays);
  return next < today ? today : next;
};
