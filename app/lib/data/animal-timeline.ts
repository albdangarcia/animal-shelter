// Pure part of the timeline gate — no Prisma imports, so it is unit-testable
// (see `animal-timeline.test.ts`). `animal-timeline.data.ts` reads the rows
// under the animal's lock and hands them here.

import {
  computeStays,
  findTimelineBreaks,
  orderStayEvents,
  type Stay,
  type StayEvent,
} from "@/app/lib/utils/stay-utils";
import {
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

/**
 * A write that puts an intake or outcome day onto an animal's timeline: a new
 * event, or an existing one moved to another day.
 */
export type TimelineChange =
  | { kind: "addIntake"; day: CalendarDay }
  | { kind: "addOutcome"; day: CalendarDay }
  | { kind: "moveIntake"; intakeId: string; day: CalendarDay }
  | { kind: "moveOutcome"; outcomeId: string; day: CalendarDay };

/** One of the animal's events, with the id of the row it came from. */
export type TimelineEvent = StayEvent & { ref: string };

// Stands in for the row an add has not written yet. Not a cuid, so it cannot
// collide with a real id.
export const NEW_EVENT_REF = "new";

export type AppliedTimelineChange = {
  before: TimelineEvent[];
  after: TimelineEvent[];
  /** The event the change adds or moves, as it stands after the change. */
  subject: TimelineEvent;
};

/**
 * The timeline before and after `change`. A moved event keeps its `ref`, so it
 * can be found on both sides; an added one appears only after.
 *
 * Throws when a move names an event that is not in `events`. The caller read
 * that row itself, so that is a bug, not something to tell staff about.
 */
export function applyTimelineChange(
  events: readonly TimelineEvent[],
  change: TimelineChange,
): AppliedTimelineChange {
  switch (change.kind) {
    case "addIntake":
    case "addOutcome": {
      const subject: TimelineEvent = {
        kind: change.kind === "addIntake" ? "intake" : "outcome",
        date: change.day,
        ref: NEW_EVENT_REF,
      };
      return { before: [...events], after: [...events, subject], subject };
    }
    case "moveIntake":
    case "moveOutcome": {
      const kind = change.kind === "moveIntake" ? "intake" : "outcome";
      const ref =
        change.kind === "moveIntake" ? change.intakeId : change.outcomeId;
      const index = events.findIndex(
        (event) => event.kind === kind && event.ref === ref,
      );
      if (index === -1) {
        throw new Error(`No ${kind} ${ref} on this animal's timeline.`);
      }
      const subject: TimelineEvent = { kind, date: change.day, ref };
      const after = [...events];
      after[index] = subject;
      return { before: [...events], after, subject };
    }
  }
}

// Which event of `others` the subject crossed on its way to where it now
// sits, of the kind that makes the crossing matter (an intake passing an
// outcome, or the reverse; passing an event of its own kind changes nothing).
// The one nearest where it started is named, since that is the bound it broke.
//
// An add has no starting place. Every writer that adds an event appends it to
// the animal's history, so it is treated as starting at the end: an addition
// dated too early crosses back over the latest events.
const findCrossedNeighbour = ({
  before,
  after,
  subject,
}: AppliedTimelineChange): {
  neighbour: TimelineEvent;
  direction: "before" | "after";
} | null => {
  const isSubject = (event: TimelineEvent) =>
    event.kind === subject.kind && event.ref === subject.ref;

  const orderedAfter = orderStayEvents(after);
  const others = orderedAfter.filter((event) => !isSubject(event));
  const to = orderedAfter.findIndex(isSubject);
  const fromIndex = orderStayEvents(before).findIndex(isSubject);
  const from = fromIndex === -1 ? others.length : fromIndex;

  const crosses = (event: TimelineEvent) => event.kind !== subject.kind;
  if (to > from) {
    const neighbour = others.slice(from, to).find(crosses);
    return neighbour ? { neighbour, direction: "after" } : null;
  }
  if (to < from) {
    const neighbour = others.slice(to, from).findLast(crosses);
    return neighbour ? { neighbour, direction: "before" } : null;
  }
  return null;
};

// How the neighbour reads from the subject's side. An intake's next outcome
// ends its stay, and an outcome's previous intake began it; the other two are
// the stays either side.
const describeNeighbour = (
  subject: TimelineEvent,
  direction: "before" | "after",
): string => {
  if (subject.kind === "intake") {
    return direction === "after"
      ? "this stay's outcome"
      : "the previous outcome";
  }
  return direction === "after" ? "the next intake" : "this stay's intake";
};

/**
 * The refusal for an intake or outcome day after `today`, or null. Every
 * event is something that already happened, so none may be dated ahead.
 */
export function refuseFutureDay(
  kind: TimelineEvent["kind"],
  day: CalendarDay,
  today: CalendarDay,
): string | null {
  return day > today ? `The ${kind} date can't be in the future.` : null;
}

/**
 * Whether `change` may be written. Returns null when it may, or a refusal for
 * staff that names what the day would cross.
 *
 * Refused:
 *  - a day after `today`;
 *  - a change that leaves the timeline with more breaks than it had
 *    (`findTimelineBreaks`).
 *
 * Counting rather than demanding no breaks at all is deliberate. An animal can
 * already hold one truthfully: reversing an outcome that is not its latest
 * leaves two intakes in a row, because the animal never left between them.
 * Only voiding the second intake can remove that, so demanding a clean
 * timeline would block every date fix on the animal for a break the fix did
 * not cause. A change that removes a break, or leaves one alone, is accepted.
 *
 * Same-day ties need no rule of their own: the comparison runs the real
 * ordering, which already reads an intake on its outcome's day as a zero-day
 * stay and an intake on the previous outcome's day as a same-day return.
 */
export function evaluateTimelineChange(
  events: readonly TimelineEvent[],
  change: TimelineChange,
  today: CalendarDay,
): string | null {
  const applied = applyTimelineChange(events, change);
  const noun = applied.subject.kind;

  const future = refuseFutureDay(noun, change.day, today);
  if (future) {
    return future;
  }

  if (
    findTimelineBreaks(applied.after).length <=
    findTimelineBreaks(applied.before).length
  ) {
    return null;
  }

  // A neighbour on a different day is a bound the new day stepped past.
  const crossed = findCrossedNeighbour(applied);
  if (crossed && crossed.neighbour.date !== change.day) {
    return `The ${noun} date can't be ${crossed.direction} ${describeNeighbour(
      applied.subject,
      crossed.direction,
    )} on ${formatShelterDay(crossed.neighbour.date)}.`;
  }

  // Otherwise the new day is not outside a bound but overfull. An intake on
  // its outcome's day, or on the previous outcome's, is accepted, so a
  // refusal on such a day means the day would hold two events of one kind,
  // which nothing records the order of.
  const { subject } = applied;
  const sameDayKinds = new Set(
    applied.after
      .filter((event) => event !== subject && event.date === change.day)
      .map((event) => event.kind),
  );
  if (sameDayKinds.size > 0) {
    const held =
      sameDayKinds.size === 2
        ? "an intake and an outcome"
        : sameDayKinds.has("intake")
          ? "an intake"
          : "an outcome";
    return `The ${noun} date can't be ${formatShelterDay(
      change.day,
    )}: this animal already has ${held} that day, and a day can hold only one of each.`;
  }

  return `The ${noun} date would put this animal's intakes and outcomes out of order.`;
}

/**
 * One of the animal's foster placements, as the bounds check reads it. The
 * foster's name is only for the refusal.
 */
export type PlacementSpan = {
  ref: string;
  startDate: CalendarDay;
  endDate: CalendarDay | null;
  /** The outcome that ended the placement, when one did. */
  outcomeId: string | null;
  fosterName: string;
};

// Whether the placement lies inside one of `stays`, edges included: it may
// start on the intake's day and end on the outcome's. A placement still open
// needs a stay still open.
const liesInsideAStay = (
  placement: Pick<PlacementSpan, "startDate" | "endDate">,
  stays: readonly Stay[],
): boolean =>
  stays.some((stay) => {
    if (stay.intakeDate > placement.startDate) return false;
    if (stay.outcomeDate === null) return true;
    return (
      placement.endDate !== null &&
      placement.startDate <= stay.outcomeDate &&
      placement.endDate <= stay.outcomeDate
    );
  });

// Whether writing `change` also ends the placement on the change's day.
// Recording an outcome ends the open placement (the create refuses a second,
// so there is at most one), and correcting an outcome's day moves the end of
// the placement it ended.
const movesWithChange = (
  placement: PlacementSpan,
  change: TimelineChange,
): boolean =>
  (change.kind === "addOutcome" && placement.endDate === null) ||
  (change.kind === "moveOutcome" && placement.outcomeId === change.outcomeId);

/**
 * Whether `change` keeps every foster placement inside a stay. Returns null
 * when it does, or a refusal for staff that names the placement it would
 * leave outside.
 *
 * A placement is time in the shelter's care spent at a foster's home, so it
 * lies inside one stay: it starts on or after that stay's intake day, and
 * ends, if it has, on or before its outcome day. Both timelines are read with
 * `computeStays`, so stays mean here what they mean everywhere else, merged
 * stays and same-day returns included. The change's own effect on placements
 * is applied first: a recorded outcome ends the open placement on its day,
 * and a corrected outcome moves the end of the placement it ended.
 *
 * Only a placement that lay inside a stay before the change is judged, the
 * way `evaluateTimelineChange` counts breaks rather than demanding none. A
 * placement already outside every stay is not something this change did, and
 * must not block an unrelated fix.
 *
 * Call it once `evaluateTimelineChange` has accepted the change. It does not
 * check the day against today or the other events itself.
 */
export function evaluatePlacementBounds(
  events: readonly TimelineEvent[],
  placements: readonly PlacementSpan[],
  change: TimelineChange,
): string | null {
  const { before, after, subject } = applyTimelineChange(events, change);
  // Only the stays' dates are read, never their length, so any day will do.
  const staysBefore = computeStays(before, change.day).stays;
  const staysAfter = computeStays(after, change.day).stays;

  const crossed = placements.flatMap((placement) => {
    if (!liesInsideAStay(placement, staysBefore)) return [];
    const moves = movesWithChange(placement, change);
    const endDate = moves ? change.day : placement.endDate;
    if (liesInsideAStay({ ...placement, endDate }, staysAfter)) return [];
    // The bound the day stepped past: the placement's last day. A placement
    // whose end moves with the outcome can only be left outside by its
    // start, and so can one whose stored end is before its start.
    return moves || endDate === null || endDate < placement.startDate
      ? [{ placement, bound: placement.startDate, verb: "began" }]
      : [{ placement, bound: endDate, verb: "ended" }];
  });
  if (crossed.length === 0) return null;

  // The one named is the bound nearest where the moved day started: an
  // intake moving later meets the earliest start first, and an outcome
  // moving earlier the latest bound.
  if (subject.kind === "intake") {
    const first = crossed.reduce((a, b) =>
      b.placement.startDate < a.placement.startDate ? b : a,
    );
    return `The intake date can't be after the foster placement with ${
      first.placement.fosterName
    } began on ${formatShelterDay(first.placement.startDate)}.`;
  }
  const last = crossed.reduce((a, b) => (b.bound > a.bound ? b : a));
  return `The outcome date can't be before the foster placement with ${
    last.placement.fosterName
  } ${last.verb} on ${formatShelterDay(last.bound)}.`;
}
