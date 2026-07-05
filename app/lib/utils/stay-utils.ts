// Pure stay-pairing logic — no Prisma imports, so it is trivially unit-testable
// and reusable. This is the SINGLE SOURCE OF TRUTH for whether an animal is "in
// care": presence is derived by pairing Intake and Outcome events, never from
// `listingStatus` (which is about public visibility, not physical presence).

import { differenceInCalendarDays } from "date-fns";

export type StayEvent = { kind: "intake" | "outcome"; date: Date };

export type Stay = {
  intakeDate: Date;
  outcomeDate: Date | null; // null = still open
  days: number; // completed: calendar days between intake and outcome;
  // open: calendar days between intake and `asOf`
};

export type StayComputation = {
  stays: Stay[]; // chronological
  isInCare: boolean; // true iff last stay is open
  currentStayDays: number | null; // days of the open stay, else null
  cumulativeDays: number; // sum of all stay days (closed + open)
};

/** Calendar-day span, floored at 0 (a same-day intake/outcome is 0 days). */
function spanDays(from: Date, to: Date): number {
  return Math.max(0, differenceInCalendarDays(to, from));
}

/**
 * Pairs one animal's intake/outcome events into discrete stays.
 *
 * Algorithm:
 *  1. Sort events ascending by date. On equal timestamps, outcomes sort before
 *     intakes (so a same-instant outcome-then-re-intake is handled correctly).
 *  2. Walk with a single open-intake pointer:
 *     - intake, no stay open  → open a stay at that date.
 *     - intake, stay open     → ignore (duplicate/erroneous entry; the animal
 *                               never physically left, so the original date stands).
 *     - outcome, stay open    → close the stay at that date.
 *     - outcome, no stay open → ignore (orphan record with no matching entry).
 *  3. `days` uses calendar-day differences, negatives clamped to 0.
 *  4. `isInCare` is true iff the walk ends with an open stay.
 */
export function computeStays(events: StayEvent[], asOf: Date): StayComputation {
  // outcome (0) before intake (1) on ties.
  const kindRank = (kind: StayEvent["kind"]) => (kind === "outcome" ? 0 : 1);
  const sorted = [...events].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime();
    return byDate !== 0 ? byDate : kindRank(a.kind) - kindRank(b.kind);
  });

  const stays: Stay[] = [];
  let openIntake: Date | null = null;

  for (const event of sorted) {
    if (event.kind === "intake") {
      if (openIntake === null) {
        openIntake = event.date;
      }
      // else: duplicate intake while already in care — ignore.
    } else {
      if (openIntake !== null) {
        stays.push({
          intakeDate: openIntake,
          outcomeDate: event.date,
          days: spanDays(openIntake, event.date),
        });
        openIntake = null;
      }
      // else: orphan outcome — ignore.
    }
  }

  // A trailing open intake is the current (still-in-care) stay.
  if (openIntake !== null) {
    stays.push({
      intakeDate: openIntake,
      outcomeDate: null,
      days: spanDays(openIntake, asOf),
    });
  }

  const isInCare = stays.length > 0 && stays[stays.length - 1].outcomeDate === null;
  const currentStayDays = isInCare ? stays[stays.length - 1].days : null;
  const cumulativeDays = stays.reduce((sum, stay) => sum + stay.days, 0);

  return { stays, isInCare, currentStayDays, cumulativeDays };
}
