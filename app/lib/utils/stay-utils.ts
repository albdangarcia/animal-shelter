// Pure stay-pairing logic — no Prisma imports, so it is trivially unit-testable
// and reusable. This is the SINGLE SOURCE OF TRUTH for whether an animal is "in
// care": presence is derived by pairing Intake and Outcome events, never from
// `listingStatus` (which is about public visibility, not physical presence).
// Callers pass only outcomes that are not reversed: a reversed outcome records
// a departure that never happened, so it ends no stay.

import { shelterDaysBetweenKeys, type CalendarDay } from "./shelter-day";

export type StayEvent = { kind: "intake" | "outcome"; date: CalendarDay };

export type Stay = {
  intakeDate: CalendarDay;
  outcomeDate: CalendarDay | null; // null = still open
  days: number; // completed: days between intake and outcome;
  // open: days between intake and `asOf`
};

export type StayComputation = {
  stays: Stay[]; // chronological
  isInCare: boolean; // true iff last stay is open
  currentStayDays: number | null; // days of the open stay, else null
  cumulativeDays: number; // sum of all stay days (closed + open)
};

/**
 * Puts one animal's intake/outcome events in the order they are paired in.
 *
 * An intake or an outcome is dated by a calendar day and nothing finer, so a
 * same-day intake and outcome are a tie and the date alone cannot say which
 * came first. Whether a stay is open at that moment can:
 *  - not in care → the intake goes first. The animal arrived and left the same
 *    day: a completed stay of zero days.
 *  - in care     → the outcome goes first. The animal left and came back the
 *    same day (an outcome followed by a re-intake), and still ends in care.
 * Grouping a day's events this way settles the common shape — at most one of
 * each kind on a day — and gives up on the rest. Any day holding two events of
 * the same kind is genuinely ambiguous: the intakes are emitted as a block and
 * the outcomes as another, so a sequence that alternated within the day (leave,
 * return, leave again) is not recovered, and its middle event is read as a
 * duplicate or an orphan. So is an outcome and an intake on the same day for an
 * animal with no earlier open stay (an outcome whose intake was never recorded,
 * followed by a fresh intake), which reads as a zero-day stay. Neither is
 * recoverable by any ordering rule: the records hold no time of day to order
 * by, so the information needed to tell them apart was never captured.
 */
export function orderStayEvents(events: StayEvent[]): StayEvent[] {
  const byDay = [...events]
    // `yyyy-MM-dd` days sort chronologically as plain strings.
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const ordered: StayEvent[] = [];
  let open = false;
  for (let start = 0; start < byDay.length; ) {
    let end = start;
    while (end < byDay.length && byDay[end].date === byDay[start].date) {
      end += 1;
    }

    const sameDay = byDay.slice(start, end);
    const intakes = sameDay.filter((event) => event.kind === "intake");
    const outcomes = sameDay.filter((event) => event.kind === "outcome");
    const inOrder: StayEvent[] = open
      ? [...outcomes, ...intakes]
      : [...intakes, ...outcomes];
    for (const event of inOrder) {
      ordered.push(event);
      // An intake while open leaves the stay open; an outcome while closed is
      // an orphan and leaves it closed. So the last event decides.
      open = event.kind === "intake";
    }
    start = end;
  }
  return ordered;
}

/**
 * Pairs one animal's intake/outcome events into discrete stays.
 *
 * Algorithm:
 *  1. Order the events (see `orderStayEvents`): ascending by day, with a
 *     same-day tie resolved by whether a stay is open.
 *  2. Walk with a single open-intake pointer:
 *     - intake, no stay open  → open a stay at that date.
 *     - intake, stay open     → ignore (duplicate/erroneous entry; the animal
 *                               never physically left, so the original date stands).
 *     - outcome, stay open    → close the stay at that date.
 *     - outcome, no stay open → ignore (orphan record with no matching entry).
 *  3. `days` counts whole calendar days, negatives clamped to 0 (a same-day
 *     stay is 0 days), so a stay's length does not depend on where the server
 *     runs or on a DST change inside it.
 *  4. `isInCare` is true iff the walk ends with an open stay.
 *
 * Consumers only read `isInCare`, the current/cumulative day counts and the
 * stays' own dates, so none depends on how a tie is broken beyond the two
 * outcomes above: a same-day stay closes (and counts as a zero-day stay in the
 * length-of-stay figures), and a same-day leave-and-return stays in care.
 */
export function computeStays(
  events: StayEvent[],
  asOf: CalendarDay,
): StayComputation {
  const sorted = orderStayEvents(events);

  const stays: Stay[] = [];
  let openIntake: StayEvent | null = null;

  for (const event of sorted) {
    if (event.kind === "intake") {
      if (openIntake === null) {
        openIntake = event;
      }
      // else: duplicate intake while already in care — ignore.
    } else {
      if (openIntake !== null) {
        stays.push({
          intakeDate: openIntake.date,
          outcomeDate: event.date,
          days: shelterDaysBetweenKeys(openIntake.date, event.date),
        });
        openIntake = null;
      }
      // else: orphan outcome — ignore.
    }
  }

  // A trailing open intake is the current (still-in-care) stay.
  if (openIntake !== null) {
    stays.push({
      intakeDate: openIntake.date,
      outcomeDate: null,
      days: shelterDaysBetweenKeys(openIntake.date, asOf),
    });
  }

  const isInCare = stays.length > 0 && stays[stays.length - 1].outcomeDate === null;
  const currentStayDays = isInCare ? stays[stays.length - 1].days : null;
  const cumulativeDays = stays.reduce((sum, stay) => sum + stay.days, 0);

  return { stays, isInCare, currentStayDays, cumulativeDays };
}
