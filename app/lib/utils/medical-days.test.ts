import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarMonths,
  dueDateIssue,
  latestDueDate,
  rabiesStatus,
} from "./medical-days";
import { calendarDay } from "./shelter-day";

const day = calendarDay;

test("addCalendarMonths: keeps the day of the month when it exists", () => {
  assert.equal(addCalendarMonths(day("2026-03-10"), 12), "2027-03-10");
  assert.equal(addCalendarMonths(day("2026-03-10"), 36), "2029-03-10");
  assert.equal(addCalendarMonths(day("2026-11-15"), 3), "2027-02-15");
});

test("addCalendarMonths: clamps to the end of a shorter month", () => {
  assert.equal(addCalendarMonths(day("2026-01-31"), 1), "2026-02-28");
  assert.equal(addCalendarMonths(day("2026-03-31"), 1), "2026-04-30");
  assert.equal(addCalendarMonths(day("2026-08-31"), 13), "2027-09-30");
});

test("addCalendarMonths: Feb 29 exists only in a leap year", () => {
  assert.equal(addCalendarMonths(day("2028-01-31"), 1), "2028-02-29");
  assert.equal(addCalendarMonths(day("2028-02-29"), 12), "2029-02-28");
  assert.equal(addCalendarMonths(day("2028-02-29"), 48), "2032-02-29");
  // 2100 is not a leap year.
  assert.equal(addCalendarMonths(day("2100-01-31"), 1), "2100-02-28");
});

test("rabiesStatus: none on record", () => {
  assert.deepEqual(rabiesStatus(null, day("2026-10-10")), { status: "NONE" });
});

test("rabiesStatus: on record with no known day", () => {
  assert.deepEqual(
    rabiesStatus({ validUntilDate: null }, day("2026-10-10")),
    { status: "DATE_UNKNOWN" },
  );
});

test("rabiesStatus: valid through the valid-until day, expired the day after", () => {
  const latest = { validUntilDate: day("2026-10-10") };
  assert.deepEqual(rabiesStatus(latest, day("2026-10-09")), {
    status: "VALID",
    validUntilDate: "2026-10-10",
  });
  assert.deepEqual(rabiesStatus(latest, day("2026-10-10")), {
    status: "VALID",
    validUntilDate: "2026-10-10",
  });
  assert.deepEqual(rabiesStatus(latest, day("2026-10-11")), {
    status: "EXPIRED",
    validUntilDate: "2026-10-10",
  });
});

test("dueDateIssue: from today up to five years ahead", () => {
  const today = day("2026-10-10");
  assert.equal(latestDueDate(today), "2031-10-10");
  assert.equal(dueDateIssue(today, today), null);
  assert.equal(dueDateIssue(day("2031-10-10"), today), null);
  assert.equal(
    dueDateIssue(day("2026-10-09"), today),
    "The due date can't be in the past.",
  );
  assert.equal(
    dueDateIssue(day("2031-10-11"), today),
    "The due date can't be more than 5 years from today.",
  );
});
