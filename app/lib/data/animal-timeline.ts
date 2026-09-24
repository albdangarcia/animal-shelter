// Pure part of the timeline gate — no Prisma imports, so it is unit-testable
// (see `animal-timeline.test.ts`). `animal-timeline.data.ts` reads the rows
// under the animal's lock and hands them here.

import {
  findTimelineBreaks,
  orderStayEvents,
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

  if (change.day > today) {
    return `The ${noun} date can't be in the future.`;
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
