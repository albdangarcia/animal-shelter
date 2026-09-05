import {
  differenceInYears,
  differenceInMonths,
  format,
  differenceInWeeks,
  differenceInDays,
  addYears,
  isPast,
  startOfDay,
  formatDistanceToNowStrict,
} from "date-fns";
import { TaskStatus } from "@/prisma/generated/enums";

interface calculateAgeStringProps {
  /**
   * The date of birth.
   */
  birthDate: Date;
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
  return simple ? calculateSimpleAge(birthDate) : calculateDetailedAge(birthDate);
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
 * Formats a date input (string, Date, undefined, or null) into a "MMM d, yyyy" string  (e.g., "Jan 15, 2023").
 * Returns "N/A" for null/undefined inputs and "Invalid Date" for invalid date values.
 *
 * @param dateInput The date input to format. Can be a string, Date object, undefined, or null.
 * @returns A formatted date string, "N/A", or "Invalid Date".
 */
export const formatDateOrNA = (dateInput: string | Date | undefined | null): string => {
  if (dateInput === null || dateInput === undefined) {
    return "N/A";
  }

  try {
    return format(dateInput, 'MMM d, yyyy');
  } catch (error) {
    console.error("Error formatting date:", error);
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
 * Formats a due date with special handling for overdue tasks.
 * @param {string | Date | undefined | null} dateInput - The due date.
 * @param {TaskStatus} status - The current status of the task.
 * @returns {string} A formatted string like "Overdue by 3 days", "in 2 hours", or "N/A".
 */
export const formatDueDate = (
  dateInput: string | Date | undefined | null,
  status: TaskStatus
): string => {
  if (dateInput === null || dateInput === undefined) {
    return "N/A";
  }

  const date = new Date(dateInput);
  const isOverdue = isPast(date);

  // Define which statuses are considered "active" for overdue checks
  const activeStatuses: TaskStatus[] = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
  ];

  if (activeStatuses.includes(status) && isOverdue) {
    // Return a special string for active, overdue tasks
    return `Overdue by ${formatDistanceToNowStrict(date)}`;
  }

  // For all other cases (done tasks, future tasks), use the standard time ago format
  return formatTimeAgo(dateInput);
};

/**
 * True when an open foster placement's expected return date has already passed.
 *
 * Mirrors attention-queue Signal 3: strictly before *today*, so a placement
 * expected back today is not yet overdue. Keep in sync with the
 * `expectedEndDate: { lt: startOfToday }` filter in attention-queue.data.ts.
 *
 * Deliberately not `isPast()` — that is timestamp-based and would flag a
 * placement due today as overdue by mid-morning, contradicting the queue.
 *
 * @param {Date | string | null | undefined} expectedEndDate - The expected return date.
 * @returns {boolean} True only when a date is set and it falls before today.
 */
export const isFosterPlacementOverdue = (
  expectedEndDate: Date | string | null | undefined
): boolean => {
  if (!expectedEndDate) return false;
  return new Date(expectedEndDate) < startOfDay(new Date());
};
