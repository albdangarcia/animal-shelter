import {
  differenceInYears,
  differenceInMonths,
  format,
  differenceInWeeks,
  differenceInDays,
  addYears,
  formatDistanceStrict,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { TaskStatus } from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "./shelter-day";

interface calculateAgeStringProps {
  /**
   * The date of birth.
   */
  birthDate: CalendarDay;
  /**
   * Optional. If true, returns the largest unit of age (e.g., "1 year" instead of "1 year, 3 months").
   * Defaults to false.
   */
  simple?: boolean;
}

/**
 * Calculates a human-readable age string from a birth date.
 * The output can be a detailed string (e.g., "1 year, 3 months") or a simple string (e.g., "1 year").
 *
 * @param {calculateAgeStringProps} props - The properties for calculating the age string.
 * @returns A string representing the calculated age.
 */
export const calculateAgeString = ({ birthDate, simple = false }: calculateAgeStringProps): string => {
  // Extract the year, month, week, or day difference based on the simple flag
  const date = parseISO(birthDate);
  return simple ? calculateSimpleAge(date) : calculateDetailedAge(date);
}

const calculateSimpleAge = (birthDate: Date): string => {
  const now = new Date();
  // Check if birthDate is in the future
  // Helper to create pluralized strings like "1 year" or "2 years"
  const pluralizeUnit = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? "" : "s"}`;

  if (birthDate > now) {
    // This case should be prevented by validation before saving to DB
    return "Birth date is in the future";
  }
  
  // Removed duplicate pluralizeUnit
  const years = differenceInYears(now, birthDate);
  if (years > 0) {
    return pluralizeUnit(years, "year");
  }

  const months = differenceInMonths(now, birthDate); // Total months
  if (months > 0) {
    return pluralizeUnit(months, "month");
  }

  const weeks = differenceInWeeks(now, birthDate); // Total weeks
  if (weeks > 0) {
    return pluralizeUnit(weeks, "week");
  }

  const days = differenceInDays(now, birthDate); // Total days
  return days === 0 ? "Newborn" : pluralizeUnit(days, "day");
};

const calculateDetailedAge = (birthDate: Date): string => {
  const now = new Date();
  // Helper to create pluralized strings like "1 year" or "2 years"
  const pluralizeUnit = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? "" : "s"}`;

  // Check if birthDate is in the future
  if (birthDate > now) {
    // This case should be prevented by validation before saving to DB
    return "Birth date is in the future";
  }

  const years = differenceInYears(now, birthDate);
  const dateAfterYears = addYears(birthDate, years);
  const months = differenceInMonths(now, dateAfterYears); // Months after full years

  if (years > 0) {
    const yearStr = pluralizeUnit(years, "year");
    const monthStr = months > 0 ? `, ${pluralizeUnit(months, "month")}` : "";
    return `${yearStr}${monthStr}`;
    }

    // If years === 0, 'months' (calculated as differenceInMonths(now, dateAfterYears))
    // effectively becomes differenceInMonths(now, birthDate) because dateAfterYears is birthDate.
    if (months > 0) {
      return pluralizeUnit(months, "month");
    }

    const weeks = differenceInWeeks(now, birthDate);
    if (weeks > 0) {
      return pluralizeUnit(weeks, "week");
    }

    const days = differenceInDays(now, birthDate);
    return days === 0 ? "Newborn" : pluralizeUnit(days, "day");
};

/** Formats a Date object into a long string format (e.g., "January 15, 2023"). */
export function formatDateToLongString(date: Date): string { 
  return format(date, 'MMMM d, yyyy');
}

/**
 * Formats a date input (string, Date, undefined, or null) into a date string.
 * Defaults to "MMM d, yyyy" (e.g., "Jan 15, 2023").
 * Returns "N/A" for null/undefined inputs and "Invalid Date" for invalid date values.
 *
 * @param dateInput The date input to format. Can be a string, Date object, undefined, or null.
 * @returns A formatted date string, "N/A", or "Invalid Date".
 */
export const formatDateOrNA = (
  dateInput: string | Date | undefined | null,
  pattern = "MMM d, yyyy",
): string => {
  if (dateInput === null || dateInput === undefined) {
    return "N/A";
  }

  try {
    return format(dateInput, pattern);
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid Date";
  }
};

/** A stable first render for instant dates, independent of the runtime's zone. */
export const formatUtcDateOrNA = (
  dateInput: string | Date | undefined | null,
  pattern = "MMM d, yyyy",
): string => {
  if (dateInput === null || dateInput === undefined) return "N/A";
  try {
    return formatInTimeZone(dateInput, "UTC", pattern);
  } catch {
    return "Invalid Date";
  }
};

/**
 * Formats a date to a "time ago" string in a simple format.
 * e.g., "5 minutes ago", "2 hours ago", "3 days ago".
 * @param {string | Date | undefined | null} dateInput - The date to format.
 * @returns {string} A string representing the time elapsed, or "N/A" for invalid input.
 */
export const formatTimeAgo = (dateInput: string | Date | undefined | null): string => {
  if (dateInput === null || dateInput === undefined) {
    return "N/A";
  }

  try {
    const date = new Date(dateInput);

    // Check for invalid date
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch (error) {
    console.error("Error formatting time ago:", error);
    return "Invalid Date";
  }
};

/**
 * Formats a day-valued due date, with special handling for overdue tasks.
 *
 * The distance is measured between two calendar days, never between a stored
 * value and the reader's clock, so it reads the same for everyone and does not
 * differ between the server render and the browser's.
 *
 * @param day - The due day, or nothing when the task is undated.
 * @param status - The current status of the task.
 * @param today - Today on the shelter's calendar.
 * @returns A string like "Overdue by 3 days", "in 2 days", "Today", or "N/A".
 */
export const formatDueDay = (
  day: string | null | undefined,
  status: TaskStatus,
  today: CalendarDay,
): string => {
  if (day === null || day === undefined) {
    return "N/A";
  }

  const due = parseCalendarDay(day);
  if (due === null) {
    return "Invalid Date";
  }
  if (due === today) {
    return "Today";
  }

  // Both days are read as plain local dates, which cancels out — the distance
  // between them is whole days either way.
  const distance = formatDistanceStrict(parseISO(due), parseISO(today));

  // Only a task someone is still expected to do can be overdue; a closed one
  // just reads as a past date.
  const isActive =
    status === TaskStatus.TODO || status === TaskStatus.IN_PROGRESS;
  if (due < today) {
    return isActive ? `Overdue by ${distance}` : `${distance} ago`;
  }
  return `in ${distance}`;
};

/**
 * True when an open foster placement's expected return date has already passed.
 *
 * Both sides are calendar days, so this is a plain string comparison: strictly
 * before *today*, so a placement expected back today is not yet overdue. The
 * attention queue draws the same boundary with the same two values.
 *
 * `today` is a parameter because only the server can resolve which day it is on
 * the shelter's calendar; a browser rendering this has been handed the answer.
 *
 * @param expectedEndDate - The expected return day, or nothing when open-ended.
 * @param today - Today on the shelter's calendar.
 * @returns True only when a day is set and it falls before today.
 */
export const isFosterPlacementOverdue = (
  expectedEndDate: string | null | undefined,
  today: CalendarDay,
): boolean => !!expectedEndDate && expectedEndDate < today;
