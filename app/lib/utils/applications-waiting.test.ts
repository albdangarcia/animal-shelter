import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysWaiting,
  summariseWaiting,
  waitingLine,
} from "./applications-waiting";
import { calendarDay } from "./shelter-day";

const NEW_YORK = "America/New_York";

test("days waited count calendar days across a month and a year end", () => {
  assert.equal(
    daysWaiting(new Date("2026-01-31T15:00:00Z"), calendarDay("2026-02-02"), NEW_YORK),
    2,
  );
  assert.equal(
    daysWaiting(new Date("2026-12-31T15:00:00Z"), calendarDay("2027-01-01"), NEW_YORK),
    1,
  );
});

test("days waited are the shelter's days, not the server's", () => {
  // 23:30 in New York on 7 March is already 8 March in UTC.
  const lateEvening = new Date("2026-03-08T04:30:00Z");
  assert.equal(daysWaiting(lateEvening, calendarDay("2026-03-08"), NEW_YORK), 1);
  assert.equal(daysWaiting(lateEvening, calendarDay("2026-03-08"), "UTC"), 0);
});

test("days waited across a DST change are calendar days, not 24-hour spans", () => {
  // Spring forward on 8 March 2026: 00:30 on the 7th to the 9th is 47 hours,
  // and two days.
  assert.equal(
    daysWaiting(new Date("2026-03-07T05:30:00Z"), calendarDay("2026-03-09"), NEW_YORK),
    2,
  );
  // Fall back on 1 November 2026: 23:30 on 31 October (EDT) is one day by
  // the 1st, though 25 hours pass before the 1st ends.
  assert.equal(
    daysWaiting(new Date("2026-11-01T03:30:00Z"), calendarDay("2026-11-01"), NEW_YORK),
    1,
  );
});

test("an application submitted today has waited 0 days, never fewer", () => {
  const today = calendarDay("2026-11-15");
  assert.equal(daysWaiting(new Date("2026-11-15T14:00:00Z"), today, NEW_YORK), 0);
  // A clock ahead of the shelter's today does not read as a negative wait.
  assert.equal(daysWaiting(new Date("2026-11-17T14:00:00Z"), today, NEW_YORK), 0);
});

test("the summary counts every submission and ages the oldest", () => {
  const today = calendarDay("2026-11-15");
  assert.deepEqual(
    summariseWaiting(
      [
        new Date("2026-11-10T15:00:00Z"),
        new Date("2026-11-06T15:00:00Z"),
        new Date("2026-11-14T15:00:00Z"),
      ],
      today,
      NEW_YORK,
    ),
    { count: 3, oldestDays: 9 },
  );
  assert.deepEqual(summariseWaiting([], today, NEW_YORK), {
    count: 0,
    oldestDays: null,
  });
});

test("the line reads in the plural, the singular, today, and none", () => {
  assert.equal(
    waitingLine("adoption", { count: 5, oldestDays: 9 }),
    "5 adoption applications · oldest 9 days",
  );
  assert.equal(
    waitingLine("foster", { count: 1, oldestDays: 1 }),
    "1 foster application · oldest 1 day",
  );
  assert.equal(
    waitingLine("adoption", { count: 2, oldestDays: 0 }),
    "2 adoption applications · oldest submitted today",
  );
  assert.equal(
    waitingLine("foster", { count: 0, oldestDays: null }),
    "No foster applications waiting",
  );
});
