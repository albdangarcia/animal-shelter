import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import {
  applyTimelineChange,
  evaluatePlacementBounds,
  evaluateTimelineChange,
  NEW_EVENT_REF,
  type PlacementSpan,
  type TimelineEvent,
} from "./animal-timeline";

const day = calendarDay;
const intake = (ref: string, d: string): TimelineEvent => ({
  kind: "intake",
  date: day(d),
  ref,
});
const outcome = (ref: string, d: string): TimelineEvent => ({
  kind: "outcome",
  date: day(d),
  ref,
});

const TODAY = day("2026-09-24");

// Arrived Jan 1, adopted Feb 1, returned Mar 1 and still in care.
const returned = [
  intake("i1", "2026-01-01"),
  outcome("o1", "2026-02-01"),
  intake("i2", "2026-03-01"),
];

test("a move replaces the event's day and keeps its ref", () => {
  const applied = applyTimelineChange(returned, {
    kind: "moveIntake",
    intakeId: "i1",
    day: day("2026-01-05"),
  });
  assert.deepEqual(applied.before, returned);
  assert.deepEqual(applied.subject, intake("i1", "2026-01-05"));
  assert.deepEqual(applied.after, [
    intake("i1", "2026-01-05"),
    outcome("o1", "2026-02-01"),
    intake("i2", "2026-03-01"),
  ]);
});

test("an add appends a new event and leaves the rest alone", () => {
  const applied = applyTimelineChange(returned, {
    kind: "addOutcome",
    day: day("2026-04-01"),
  });
  assert.deepEqual(applied.before, returned);
  assert.deepEqual(applied.subject, {
    kind: "outcome",
    date: day("2026-04-01"),
    ref: NEW_EVENT_REF,
  });
  assert.equal(applied.after.length, 4);
});

test("moving an event that is not on the timeline is a bug, and throws", () => {
  assert.throws(() =>
    applyTimelineChange(returned, {
      kind: "moveOutcome",
      outcomeId: "i1",
      day: day("2026-01-05"),
    }),
  );
});

test("a move within its stay is accepted", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i1", day: day("2026-01-20") },
      TODAY,
    ),
    null,
  );
});

test("an intake moved onto its outcome's day, or the previous one's, is accepted", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i1", day: day("2026-02-01") },
      TODAY,
    ),
    null,
  );
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i2", day: day("2026-02-01") },
      TODAY,
    ),
    null,
  );
});

test("an intake moved past its stay's outcome is refused, naming the outcome", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i1", day: day("2026-02-10") },
      TODAY,
    ),
    "The intake date can't be after this stay's outcome on Feb 1, 2026.",
  );
});

test("an intake moved across several stays names the first outcome it crosses", () => {
  const twice = [...returned, outcome("o2", "2026-04-01"), intake("i3", "2026-05-01")];
  assert.equal(
    evaluateTimelineChange(
      twice,
      { kind: "moveIntake", intakeId: "i1", day: day("2026-06-01") },
      TODAY,
    ),
    "The intake date can't be after this stay's outcome on Feb 1, 2026.",
  );
});

test("an intake moved back before the previous outcome is refused", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i2", day: day("2026-01-15") },
      TODAY,
    ),
    "The intake date can't be before the previous outcome on Feb 1, 2026.",
  );
});

test("an outcome moved either way past its neighbours is refused", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveOutcome", outcomeId: "o1", day: day("2026-03-05") },
      TODAY,
    ),
    "The outcome date can't be after the next intake on Mar 1, 2026.",
  );
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveOutcome", outcomeId: "o1", day: day("2025-12-01") },
      TODAY,
    ),
    "The outcome date can't be before this stay's intake on Jan 1, 2026.",
  );
});

test("an add dated before the latest event is refused, naming it", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "addOutcome", day: day("2026-02-15") },
      TODAY,
    ),
    "The outcome date can't be before this stay's intake on Mar 1, 2026.",
  );
  const archived = returned.slice(0, 2);
  assert.equal(
    evaluateTimelineChange(
      archived,
      { kind: "addIntake", day: day("2026-01-15") },
      TODAY,
    ),
    "The intake date can't be before the previous outcome on Feb 1, 2026.",
  );
  assert.equal(
    evaluateTimelineChange(
      archived,
      { kind: "addIntake", day: day("2026-02-01") },
      TODAY,
    ),
    null,
  );
});

test("an intake added while the animal is still in care is refused", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "addIntake", day: day("2026-04-01") },
      TODAY,
    ),
    "The intake date would put this animal's intakes and outcomes out of order.",
  );
});

test("a future day is refused, even where the order would hold", () => {
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i2", day: day("2026-09-25") },
      TODAY,
    ),
    "The intake date can't be in the future.",
  );
  assert.equal(
    evaluateTimelineChange(
      returned,
      { kind: "moveIntake", intakeId: "i2", day: TODAY },
      TODAY,
    ),
    null,
  );
});

// Adopted Feb 1, returned Mar 1, adopted again Apr 1, returned May 1, and then
// the first adoption was reversed: the animal never left, so the Mar 1 intake
// duplicates the Jan 1 one.
const duplicated = [
  intake("i1", "2026-01-01"),
  intake("i2", "2026-03-01"),
  outcome("o2", "2026-04-01"),
  intake("i3", "2026-05-01"),
];

test("an existing break does not block a harmless move", () => {
  assert.equal(
    evaluateTimelineChange(
      duplicated,
      { kind: "moveIntake", intakeId: "i1", day: day("2026-01-03") },
      TODAY,
    ),
    null,
  );
  assert.equal(
    evaluateTimelineChange(
      duplicated,
      { kind: "moveIntake", intakeId: "i3", day: day("2026-04-10") },
      TODAY,
    ),
    null,
  );
});

test("a move that keeps the break count is accepted", () => {
  // Moving the duplicate intake past the only outcome leaves the timeline
  // intake, outcome, intake, intake: the break moves, but there is no second.
  assert.equal(
    evaluateTimelineChange(
      duplicated,
      { kind: "moveIntake", intakeId: "i2", day: day("2026-04-20") },
      TODAY,
    ),
    null,
  );
});

test("a move that removes a break is accepted", () => {
  // An outcome recorded before the intake it closes: moving the intake onto
  // the outcome's day makes it a zero-day stay.
  assert.equal(
    evaluateTimelineChange(
      [outcome("o1", "2026-01-01"), intake("i1", "2026-01-05")],
      { kind: "moveIntake", intakeId: "i1", day: day("2026-01-01") },
      TODAY,
    ),
    null,
  );
});

test("an existing break does not excuse a new one", () => {
  assert.equal(
    evaluateTimelineChange(
      duplicated,
      { kind: "moveIntake", intakeId: "i3", day: day("2026-03-20") },
      TODAY,
    ),
    "The intake date can't be before the previous outcome on Apr 1, 2026.",
  );
});

test("an intake moved onto a day already holding a stay is refused as overfull", () => {
  const overfull =
    "The intake date can't be Jan 1, 2026: this animal already has an intake and an outcome that day, and a day can hold only one of each.";

  // A zero-day stay on Jan 1, then a return on Jan 2 moved back onto it.
  assert.equal(
    evaluateTimelineChange(
      [
        intake("i1", "2026-01-01"),
        outcome("o1", "2026-01-01"),
        intake("i2", "2026-01-02"),
      ],
      { kind: "moveIntake", intakeId: "i2", day: day("2026-01-01") },
      TODAY,
    ),
    overfull,
  );

  // Left and came back on Jan 1; the first arrival moved onto that day.
  assert.equal(
    evaluateTimelineChange(
      [
        intake("i1", "2025-12-20"),
        outcome("o1", "2026-01-01"),
        intake("i2", "2026-01-01"),
      ],
      { kind: "moveIntake", intakeId: "i1", day: day("2026-01-01") },
      TODAY,
    ),
    overfull,
  );
});

test("an outcome moved onto a day already holding a stay is refused as overfull", () => {
  // Adopted Jan 10, then a zero-day stay on Jan 20; the adoption moved onto
  // that day.
  assert.equal(
    evaluateTimelineChange(
      [
        intake("i1", "2026-01-01"),
        outcome("o1", "2026-01-10"),
        intake("i2", "2026-01-20"),
        outcome("o2", "2026-01-20"),
      ],
      { kind: "moveOutcome", outcomeId: "o1", day: day("2026-01-20") },
      TODAY,
    ),
    "The outcome date can't be Jan 20, 2026: this animal already has an intake and an outcome that day, and a day can hold only one of each.",
  );
});

// A placement with Ada unless another foster is named. An `outcomeId` links
// it to the outcome that ended it.
const placement = (
  ref: string,
  start: string,
  end: string | null = null,
  { outcomeId = null, fosterName = "Ada" }: Partial<PlacementSpan> = {},
): PlacementSpan => ({
  ref,
  startDate: day(start),
  endDate: end === null ? null : day(end),
  outcomeId,
  fosterName,
});

// Arrived Jan 1 and still in care.
const inCare = [intake("i1", "2026-01-01")];
// Arrived Jan 1 and left Jan 31.
const left = [intake("i1", "2026-01-01"), outcome("o1", "2026-01-31")];

test("an intake moved past an open placement's start is refused, and its start day is accepted", () => {
  const placements = [placement("p1", "2026-01-05")];
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-01-06"),
    }),
    "The intake date can't be after the foster placement with Ada began on Jan 5, 2026.",
  );
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-01-05"),
    }),
    null,
  );
});

test("an intake moved past a returned placement's start is refused, naming the earliest crossed", () => {
  const placements = [
    placement("p1", "2026-01-03", "2026-01-04", { fosterName: "Ada" }),
    placement("p2", "2026-01-06", null, { fosterName: "Bea" }),
  ];
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-01-10"),
    }),
    "The intake date can't be after the foster placement with Ada began on Jan 3, 2026.",
  );
  // Past the returned one only.
  assert.equal(
    evaluatePlacementBounds(inCare, placements.slice(0, 1), {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-01-04"),
    }),
    "The intake date can't be after the foster placement with Ada began on Jan 3, 2026.",
  );
});

test("a placement in another stay does not block a move", () => {
  // In foster during the first stay; the return's intake moved later.
  assert.equal(
    evaluatePlacementBounds(
      returned,
      [placement("p1", "2026-01-10", "2026-01-20")],
      { kind: "moveIntake", intakeId: "i2", day: day("2026-03-10") },
    ),
    null,
  );
});

test("an outcome added before a returned placement's end is refused, and its end day is accepted", () => {
  const placements = [placement("p1", "2026-01-05", "2026-01-20")];
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "addOutcome",
      day: day("2026-01-15"),
    }),
    "The outcome date can't be before the foster placement with Ada ended on Jan 20, 2026.",
  );
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "addOutcome",
      day: day("2026-01-20"),
    }),
    null,
  );
});

test("an outcome added before the open placement's start is refused, and its start day is accepted", () => {
  const placements = [placement("p1", "2026-01-10")];
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "addOutcome",
      day: day("2026-01-09"),
    }),
    "The outcome date can't be before the foster placement with Ada began on Jan 10, 2026.",
  );
  // It ends the placement on the day it began.
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "addOutcome",
      day: day("2026-01-10"),
    }),
    null,
  );
});

test("an outcome crossing both kinds of bound names the later one", () => {
  const placements = [
    placement("p1", "2026-01-02", "2026-01-08", { fosterName: "Ada" }),
    placement("p2", "2026-01-10", null, { fosterName: "Bea" }),
  ];
  assert.equal(
    evaluatePlacementBounds(inCare, placements, {
      kind: "addOutcome",
      day: day("2026-01-05"),
    }),
    "The outcome date can't be before the foster placement with Bea began on Jan 10, 2026.",
  );
  // The bound decides, not which placement came first: with the returned one
  // ending after the open one began, its end is the later bound.
  assert.equal(
    evaluatePlacementBounds(
      inCare,
      [
        placement("p1", "2026-01-02", "2026-01-12", { fosterName: "Ada" }),
        placement("p2", "2026-01-10", null, { fosterName: "Bea" }),
      ],
      { kind: "addOutcome", day: day("2026-01-05") },
    ),
    "The outcome date can't be before the foster placement with Ada ended on Jan 12, 2026.",
  );
});

test("an outcome moved before an unlinked placement's end is refused", () => {
  const placements = [placement("p1", "2026-01-05", "2026-01-20")];
  assert.equal(
    evaluatePlacementBounds(left, placements, {
      kind: "moveOutcome",
      outcomeId: "o1",
      day: day("2026-01-15"),
    }),
    "The outcome date can't be before the foster placement with Ada ended on Jan 20, 2026.",
  );
  assert.equal(
    evaluatePlacementBounds(left, placements, {
      kind: "moveOutcome",
      outcomeId: "o1",
      day: day("2026-01-20"),
    }),
    null,
  );
});

test("the placement an outcome ended moves with it, bounded by its start", () => {
  const placements = [
    placement("p1", "2026-01-05", "2026-01-31", { outcomeId: "o1" }),
  ];
  assert.equal(
    evaluatePlacementBounds(left, placements, {
      kind: "moveOutcome",
      outcomeId: "o1",
      day: day("2026-01-10"),
    }),
    null,
  );
  assert.equal(
    evaluatePlacementBounds(left, placements, {
      kind: "moveOutcome",
      outcomeId: "o1",
      day: day("2026-01-04"),
    }),
    "The outcome date can't be before the foster placement with Ada began on Jan 5, 2026.",
  );
});

test("a placement already outside every stay does not block a change", () => {
  // Begun before the only intake, so inside no stay.
  const late = [intake("i1", "2026-01-10")];
  const placements = [placement("p1", "2026-01-05")];
  assert.equal(
    evaluatePlacementBounds(late, placements, {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-01-12"),
    }),
    null,
  );
  assert.equal(
    evaluatePlacementBounds(late, placements, {
      kind: "addOutcome",
      day: day("2026-01-11"),
    }),
    null,
  );
  // Returned after the stay's outcome.
  assert.equal(
    evaluatePlacementBounds(
      left,
      [placement("p1", "2026-01-05", "2026-02-10")],
      {
        kind: "moveOutcome",
        outcomeId: "o1",
        day: day("2026-01-20"),
      },
    ),
    null,
  );
});

test("an intake added leaves every placement where it was", () => {
  assert.equal(
    evaluatePlacementBounds(
      left,
      [placement("p1", "2026-01-05", "2026-01-20")],
      {
        kind: "addIntake",
        day: day("2026-03-01"),
      },
    ),
    null,
  );
});

test("on a merged stay, the stay reads from the earlier intake", () => {
  // Left Feb 1, back Mar 1, and the departure reversed: one stay from Jan 1.
  const merged = [intake("i1", "2026-01-01"), intake("i2", "2026-03-01")];
  const afterReturn = [placement("p1", "2026-03-05")];
  // Moving the second intake past the placement changes no stay.
  assert.equal(
    evaluatePlacementBounds(merged, afterReturn, {
      kind: "moveIntake",
      intakeId: "i2",
      day: day("2026-03-10"),
    }),
    null,
  );
  // Nor does moving the first past it, while the second still opens the
  // stay before the placement began.
  assert.equal(
    evaluatePlacementBounds(merged, afterReturn, {
      kind: "moveIntake",
      intakeId: "i1",
      day: day("2026-03-03"),
    }),
    null,
  );
  // Moving the first past a placement from before the second is refused.
  assert.equal(
    evaluatePlacementBounds(
      merged,
      [placement("p1", "2026-01-10", "2026-01-20")],
      {
        kind: "moveIntake",
        intakeId: "i1",
        day: day("2026-01-15"),
      },
    ),
    "The intake date can't be after the foster placement with Ada began on Jan 10, 2026.",
  );
});

test("same-day edges: a placement may begin on the intake day and end on the outcome day", () => {
  assert.equal(
    evaluatePlacementBounds(
      left,
      [placement("p1", "2026-01-01", "2026-01-31")],
      {
        kind: "moveIntake",
        intakeId: "i1",
        day: day("2026-01-01"),
      },
    ),
    null,
  );
  // Out and back the same day, then an outcome on that day.
  const sameDay = [placement("p1", "2026-01-05", "2026-01-05")];
  assert.equal(
    evaluatePlacementBounds(inCare, sameDay, {
      kind: "addOutcome",
      day: day("2026-01-05"),
    }),
    null,
  );
  assert.equal(
    evaluatePlacementBounds(inCare, sameDay, {
      kind: "addOutcome",
      day: day("2026-01-04"),
    }),
    "The outcome date can't be before the foster placement with Ada ended on Jan 5, 2026.",
  );
});

test("on a same-day return, a placement begun that day belongs to the new stay", () => {
  // Left and came back on Jan 10, and went to a foster the same day.
  const backSameDay = [
    intake("i1", "2026-01-01"),
    outcome("o1", "2026-01-10"),
    intake("i2", "2026-01-10"),
  ];
  const placements = [placement("p1", "2026-01-10")];
  // Moving the departure earlier leaves the new stay, and the placement, as
  // they were.
  assert.equal(
    evaluatePlacementBounds(backSameDay, placements, {
      kind: "moveOutcome",
      outcomeId: "o1",
      day: day("2026-01-08"),
    }),
    null,
  );
  // Moving the return later leaves the placement begun before it.
  assert.equal(
    evaluatePlacementBounds(backSameDay, placements, {
      kind: "moveIntake",
      intakeId: "i2",
      day: day("2026-01-12"),
    }),
    "The intake date can't be after the foster placement with Ada began on Jan 10, 2026.",
  );
});

test("in a zero-day stay, a placement on that day lies inside it", () => {
  // Arrived and left on Jan 5, out to a foster and back that same day.
  const sameDay = [placement("p1", "2026-01-05", "2026-01-05")];
  assert.equal(
    evaluatePlacementBounds([intake("i1", "2026-01-05")], sameDay, {
      kind: "addOutcome",
      day: day("2026-01-05"),
    }),
    null,
  );
  // The open placement ends with the outcome, on the day it began.
  assert.equal(
    evaluatePlacementBounds(
      [intake("i1", "2026-01-05")],
      [placement("p1", "2026-01-05")],
      { kind: "addOutcome", day: day("2026-01-05") },
    ),
    null,
  );
  // The day pairs as arrived-then-left, a closed stay, not as an outcome
  // before a stay that stays open: so a return on Jan 6 no longer fits.
  assert.equal(
    evaluatePlacementBounds(
      [intake("i1", "2026-01-05")],
      [placement("p1", "2026-01-05", "2026-01-06")],
      { kind: "addOutcome", day: day("2026-01-05") },
    ),
    "The outcome date can't be before the foster placement with Ada ended on Jan 6, 2026.",
  );
  // A stay moved onto its outcome's day keeps a placement on that day, and
  // refuses one from before it.
  const leftJan5 = [intake("i1", "2026-01-01"), outcome("o1", "2026-01-05")];
  const toZeroDays = {
    kind: "moveIntake",
    intakeId: "i1",
    day: day("2026-01-05"),
  } as const;
  assert.equal(evaluatePlacementBounds(leftJan5, sameDay, toZeroDays), null);
  assert.equal(
    evaluatePlacementBounds(
      leftJan5,
      [placement("p1", "2026-01-03", "2026-01-04")],
      toZeroDays,
    ),
    "The intake date can't be after the foster placement with Ada began on Jan 3, 2026.",
  );
});

test("a returned placement stored ending before it began is named by its start", () => {
  // Its last day is its start, so that is the bound an earlier day crosses.
  assert.equal(
    evaluatePlacementBounds(
      left,
      [placement("p1", "2026-01-20", "2026-01-10")],
      {
        kind: "moveOutcome",
        outcomeId: "o1",
        day: day("2026-01-15"),
      },
    ),
    "The outcome date can't be before the foster placement with Ada began on Jan 20, 2026.",
  );
});
