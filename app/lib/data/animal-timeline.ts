// Pure part of the timeline gate — no Prisma imports, so it is unit-testable
// (see `animal-timeline.test.ts`). `animal-timeline.data.ts` reads the rows
// under the animal's lock and hands them here.

import {
  computeStays,
  findListingMismatch,
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
 * Where the animal's listing says it is, as `evaluateListingAgreement` reads
 * it: archived or not, and when archived, the live outcome that archived it
 * (the latest one recorded), if it has one.
 */
export type ListingState = {
  archived: boolean;
  archivingOutcomeRef: string | null;
};

// Whether the listing and the timeline agree. The timeline must say the
// animal is where its listing says (`findListingMismatch`), and an archived
// animal's timeline must end on the day of the outcome that archived it: no
// event may be dated after the animal's last departure.
const listingAgrees = (
  events: readonly TimelineEvent[],
  listing: ListingState,
): boolean => {
  if (findListingMismatch(events, listing.archived)) return false;
  if (!listing.archived) return true;
  const archiving = events.find(
    (event) =>
      event.kind === "outcome" && event.ref === listing.archivingOutcomeRef,
  );
  return !archiving || events.every((event) => event.date <= archiving.date);
};

/**
 * Whether `change` keeps the animal's listing agreeing with its timeline.
 * Returns null when it does, or a refusal for staff naming the event the day
 * would have to stay clear of.
 *
 * `evaluateTimelineChange` counts breaks, and a timeline can hold one
 * truthfully: reversing an outcome that is not the latest leaves two intakes
 * in a row. A day dated into that gap removes the break, so the order alone
 * accepts it. But recording an outcome archives the animal whatever its day,
 * so an outcome dated before a later return would leave an archived animal
 * whose timeline ends on an intake, and a reversal or a re-intake would then
 * read the wrong outcome as the one that archived it. So:
 *  - recording an outcome archives the animal by it, so the outcome must come
 *    after every other intake and outcome on the timeline (its day may be the
 *    latest one's day, when the order reads it as after);
 *  - correcting the outcome that archived the animal may not move it before
 *    any of them, and correcting another intake or outcome may not move it
 *    after that outcome;
 *  - for an animal in care, no change may leave its timeline ending on an
 *    outcome, and a re-intake must come after its last outcome.
 *
 * `listing` is the listing before the change, read behind the animal's lock.
 * An outcome being recorded is taken to archive an animal that was not
 * archived, and a re-intake to take an archived one out, whatever `listing`
 * says: a writer may already have written the listing it is about to justify.
 *
 * As with the breaks, only a change that makes them disagree is refused. A
 * listing that already disagreed is not this change's doing, and must not
 * block an unrelated fix.
 *
 * Call it once `evaluateTimelineChange` has accepted the change.
 */
export function evaluateListingAgreement(
  events: readonly TimelineEvent[],
  change: TimelineChange,
  listing: ListingState,
): string | null {
  const { before, after, subject } = applyTimelineChange(events, change);
  const listedBefore: ListingState =
    change.kind === "addOutcome"
      ? { archived: false, archivingOutcomeRef: null }
      : change.kind === "addIntake"
        ? { ...listing, archived: true }
        : listing;
  const listedAfter: ListingState =
    change.kind === "addOutcome"
      ? { archived: true, archivingOutcomeRef: NEW_EVENT_REF }
      : change.kind === "addIntake"
        ? { archived: false, archivingOutcomeRef: null }
        : listing;

  if (!listingAgrees(before, listedBefore) || listingAgrees(after, listedAfter)) {
    return null;
  }

  const noun = subject.kind;
  const generic = `The ${noun} date would put this animal's intakes and outcomes out of order.`;
  // Only an archived animal gets here. Making an in-care timeline end on an
  // outcome always adds a break, which `evaluateTimelineChange` refuses first.
  const archiving = after.find(
    (event) =>
      event.kind === "outcome" &&
      event.ref === listedAfter.archivingOutcomeRef,
  );
  if (!listedAfter.archived || !archiving) {
    return generic;
  }

  if (subject === archiving) {
    // The archiving outcome has to be the timeline's last event.
    const bound = orderStayEvents(after)
      .filter((event) => event !== subject)
      .at(-1);
    if (!bound) {
      return generic;
    }
    if (bound.date !== change.day) {
      return `The outcome date can't be before this animal's latest ${
        bound.kind
      } on ${formatShelterDay(bound.date)}.`;
    }
    // On its own day the outcome is refused only when that day's intake
    // reads as after it: when a stay was already open going into the day,
    // because the intake repeats an earlier one with no outcome between
    // them. Moving that intake to an earlier day lets the outcome through.
    return `The outcome date can't be on or before this animal's latest intake on ${formatShelterDay(
      bound.date,
    )}: that intake repeats an earlier one, with no outcome recorded between them, so the outcome would read as coming before it. The animal never left, so that intake marks no real return: correct it to an earlier day, or date the outcome later.`;
  }

  // Nothing else may come after the archiving outcome.
  if (change.day >= archiving.date) {
    const relation = change.day === archiving.date ? "on or after" : "after";
    return `The ${noun} date can't be ${relation} this animal's latest outcome on ${formatShelterDay(
      archiving.date,
    )}.`;
  }
  // The day is earlier than that outcome, but it changed whether a stay is
  // open going into the outcome's day, and so the order that day is read in:
  // an intake on it now reads as a return after the outcome.
  const mismatch = findListingMismatch(after, true);
  if (mismatch?.kind === "here-but-archived") {
    return `The ${noun} date can't be ${formatShelterDay(
      change.day,
    )}: the intake on ${formatShelterDay(
      mismatch.lastEvent.date,
    )} would then read as a return after this animal's latest outcome that same day, and its record would say it is back in care. If the animal never left before that day, that intake repeats its arrival: correct it to an earlier day first.`;
  }
  return generic;
}

/**
 * Whether reversing the outcome `outcomeId` keeps the animal's listing
 * agreeing with its timeline. Returns null when it does, or a refusal for
 * staff.
 *
 * A reversal is not passed through `evaluateTimelineChange`: reversing an
 * outcome that is not the latest leaves two intakes in a row, and that is the
 * truthful record. But it must not leave the listing saying one thing and the
 * timeline another. Reversing the outcome that archived the animal takes it
 * out of the archive and only removes the last event, so it is not judged.
 * Reversing an earlier one leaves the animal archived, and can make
 * the timeline read as in care: when the outcome that archived the animal
 * shares its day with an intake, which comes first that day is read from
 * whether a stay was open before it. With the earlier departure gone, the
 * stay is open, so the intake reads as a return after the final outcome.
 *
 * `listing` is the listing before the reversal, read behind the animal's
 * lock. As with the other checks, a listing that already disagreed does not
 * block the reversal.
 */
export function evaluateOutcomeReversal(
  events: readonly TimelineEvent[],
  outcomeId: string,
  listing: ListingState,
): string | null {
  // Reversing the outcome that archived the animal restores its listing and
  // removes the timeline's last event, so it is not judged here: whatever
  // the timeline then says, the animal is back where it was before that
  // outcome, and an animal with no intake on record is left alone.
  if (listing.archived && listing.archivingOutcomeRef === outcomeId) {
    return null;
  }
  const after = events.filter(
    (event) => !(event.kind === "outcome" && event.ref === outcomeId),
  );
  const listedAfter = listing;
  if (!listingAgrees(events, listing) || listingAgrees(after, listedAfter)) {
    return null;
  }

  const mismatch = findListingMismatch(after, listedAfter.archived);
  const archiving = after.find(
    (event) =>
      event.kind === "outcome" && event.ref === listedAfter.archivingOutcomeRef,
  );
  // Removing an outcome only adds a disagreement through the order of the
  // archiving outcome's own day, so the intake is on that day.
  if (mismatch?.kind === "here-but-archived" && archiving) {
    return `This outcome can't be reversed: without it, the intake on ${formatShelterDay(
      mismatch.lastEvent.date,
    )} would read as a return after this animal's latest outcome that same day, and its record would say it is back in care. If this outcome never happened, the animal never left, so that intake repeats its arrival: correct it to an earlier day first, then reverse this outcome.`;
  }
  return "This outcome can't be reversed: without it, this animal's intakes and outcomes would no longer agree with its listing.";
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
