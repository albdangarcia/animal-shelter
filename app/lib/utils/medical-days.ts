// Day arithmetic and derived facts for medical entries. Pure: no Prisma and no
// clock, so the unit tests can pin every branch.

import type { CalendarDay } from "@/app/lib/utils/shelter-day";

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
