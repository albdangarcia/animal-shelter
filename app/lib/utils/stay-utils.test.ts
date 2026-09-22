import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "./shelter-day";
import { computeStays, orderStayEvents, type StayEvent } from "./stay-utils";

// Stays are counted in calendar days, so nothing here depends on a timezone —
// not the shelter's, and not the one the tests happen to run in.
const day = calendarDay;
const intake = (d: string): StayEvent => ({ kind: "intake", date: day(d) });
const outcome = (d: string): StayEvent => ({ kind: "outcome", date: day(d) });

const SEP_10 = "2026-09-10";
const SEP_15 = "2026-09-15";
const SEP_20 = "2026-09-20";
const SEP_18 = day("2026-09-18");

test("a same-day intake and outcome close a stay of zero days", () => {
  const result = computeStays([outcome(SEP_10), intake(SEP_10)], SEP_18);
  assert.equal(result.isInCare, false);
  assert.equal(result.stays.length, 1);
  assert.deepEqual(result.stays[0], {
    intakeDate: SEP_10,
    outcomeDate: SEP_10,
    days: 0,
  });
  assert.equal(result.cumulativeDays, 0);
});

test("the order the same-day events arrive in does not change the result", () => {
  const a = computeStays([intake(SEP_10), outcome(SEP_10)], SEP_18);
  const b = computeStays([outcome(SEP_10), intake(SEP_10)], SEP_18);
  assert.deepEqual(a, b);
});

test("an outcome then a re-intake on one day still ends in care", () => {
  const result = computeStays(
    [intake(SEP_10), outcome(SEP_15), intake(SEP_15)],
    SEP_18,
  );
  assert.equal(result.isInCare, true);
  assert.deepEqual(result.stays, [
    { intakeDate: SEP_10, outcomeDate: SEP_15, days: 5 },
    { intakeDate: SEP_15, outcomeDate: null, days: 3 },
  ]);
  assert.equal(result.currentStayDays, 3);
  assert.equal(result.cumulativeDays, 8);
});

test("a same-day stay followed by a later stay reads as two stays", () => {
  const result = computeStays(
    [intake(SEP_10), outcome(SEP_10), intake(SEP_15)],
    SEP_18,
  );
  assert.equal(result.isInCare, true);
  assert.equal(result.stays.length, 2);
  assert.equal(result.stays[0].days, 0);
  assert.equal(result.stays[0].outcomeDate, SEP_10);
  assert.equal(result.currentStayDays, 3);
});

test("distinct-day events keep their chronological order", () => {
  const result = computeStays(
    [outcome(SEP_15), intake(SEP_10), intake(SEP_20)],
    day("2026-09-22"),
  );
  assert.equal(result.isInCare, true);
  assert.deepEqual(
    result.stays.map((stay) => stay.days),
    [5, 2],
  );
});

test("an orphan outcome with no earlier intake is ignored", () => {
  const result = computeStays([outcome(SEP_10), intake(SEP_15)], SEP_18);
  assert.equal(result.isInCare, true);
  assert.equal(result.stays.length, 1);
  assert.equal(result.stays[0].intakeDate, SEP_15);
});

test("a duplicate intake while in care keeps the original date", () => {
  const result = computeStays([intake(SEP_10), intake(SEP_15)], SEP_18);
  assert.equal(result.stays.length, 1);
  assert.equal(result.stays[0].intakeDate, SEP_10);
  assert.equal(result.currentStayDays, 8);
});

test("a stay across a DST change counts calendar days, not 24-hour blocks", () => {
  // Mar 8, 2026 is a 23-hour day in a zone that observes DST and Nov 1 is a
  // 25-hour one. A day count cannot see either.
  assert.equal(
    computeStays(
      [intake("2026-03-07"), outcome("2026-03-09")],
      day("2026-03-20"),
    ).stays[0].days,
    2,
  );
  assert.equal(
    computeStays(
      [intake("2026-10-31"), outcome("2026-11-02")],
      day("2026-11-20"),
    ).stays[0].days,
    2,
  );
});

test("an open stay is measured to `asOf`", () => {
  const result = computeStays([intake(SEP_10)], day("2026-09-11"));
  assert.equal(result.isInCare, true);
  assert.equal(result.currentStayDays, 1);
  assert.equal(
    computeStays([intake(SEP_10)], day(SEP_10)).currentStayDays,
    0,
  );
});

test("ordering puts a same-day intake first only while no stay is open", () => {
  const closed = orderStayEvents([outcome(SEP_10), intake(SEP_10)]);
  assert.deepEqual(closed.map((event) => event.kind), ["intake", "outcome"]);

  const open = orderStayEvents([
    intake("2026-09-01"),
    intake(SEP_10),
    outcome(SEP_10),
  ]);
  assert.deepEqual(open.map((event) => event.kind), [
    "intake",
    "outcome",
    "intake",
  ]);
});

test("a day holding two events of one kind keeps only the outer pair", () => {
  // A leave, a return and a second leave can all be recorded on one day. The
  // day is all the order there is, so the events are grouped by kind and the
  // middle one is lost: the second outcome reads as an orphan. Pinned here
  // because it is a deliberate limit, not an oversight.
  const result = computeStays(
    [
      intake("2026-09-01"),
      outcome(SEP_10),
      intake(SEP_10),
      outcome(SEP_10),
    ],
    SEP_18,
  );
  assert.equal(result.isInCare, true);
  assert.deepEqual(
    result.stays.map((stay) => stay.days),
    [9, 8],
  );
});
