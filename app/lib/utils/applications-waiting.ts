// The dashboard's "Applications waiting" card: which statuses wait for a
// review decision, how long the oldest has waited, and the line that says so.
// Pure, so the wording and the day arithmetic are unit-tested.

import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  shelterDayKey,
  shelterDaysBetweenKeys,
  type CalendarDay,
} from "./shelter-day";

/**
 * The statuses that wait for a review decision. WAITLISTED is parked on
 * purpose and APPROVED waits on the adoption, not on a review, so neither is
 * counted. For an adoption application this is its effective status: an
 * outcome closes an open application without changing its column.
 */
export const WAITING_STATUSES = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
] as const satisfies readonly ApplicationStatus[];

export type ApplicationsWaiting = {
  count: number;
  /** Shelter-calendar days since the oldest counted application was
   *  submitted; null when none is waiting. */
  oldestDays: number | null;
};

/**
 * Whole days an application submitted at `submittedAt` has waited by
 * `today`, both on the shelter's calendar, so an application submitted late
 * in the evening has waited one day the next morning wherever the server is.
 */
export const daysWaiting = (
  submittedAt: Date,
  today: CalendarDay,
  timezone: string,
): number => shelterDaysBetweenKeys(shelterDayKey(submittedAt, timezone), today);

/** The count and the oldest's age from the submission times counted. */
export const summariseWaiting = (
  submittedAts: readonly Date[],
  today: CalendarDay,
  timezone: string,
): ApplicationsWaiting => {
  if (submittedAts.length === 0) return { count: 0, oldestDays: null };
  const oldest = submittedAts.reduce((a, b) => (b < a ? b : a));
  return {
    count: submittedAts.length,
    oldestDays: daysWaiting(oldest, today, timezone),
  };
};

export type ApplicationKind = "adoption" | "foster";

/**
 * The card's line for one kind: "5 adoption applications · oldest 9 days",
 * or "No foster applications waiting".
 */
export const waitingLine = (
  kind: ApplicationKind,
  { count, oldestDays }: ApplicationsWaiting,
): string => {
  if (count === 0 || oldestDays === null) {
    return `No ${kind} applications waiting`;
  }
  const noun = `${kind} ${count === 1 ? "application" : "applications"}`;
  const oldest =
    oldestDays === 0
      ? "oldest submitted today"
      : `oldest ${oldestDays} ${oldestDays === 1 ? "day" : "days"}`;
  return `${count} ${noun} · ${oldest}`;
};
