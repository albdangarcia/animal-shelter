import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import {
  applyTimelineChange,
  evaluateTimelineChange,
  NEW_EVENT_REF,
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
