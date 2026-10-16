import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarMonths,
  beforeBirthIssue,
  beforeIntakeIssue,
  dueDateIssue,
  futureDayIssue,
  latestDueDate,
  nextDueDate,
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
  assert.equal(
    dueDateIssue(day("2026-10-09"), today, "The review date"),
    "The review date can't be in the past.",
  );
});

test("nextDueDate: the day given plus the interval", () => {
  const today = calendarDay("2026-10-10");
  assert.equal(nextDueDate(calendarDay("2026-10-10"), 14, today), "2026-10-24");
  assert.equal(nextDueDate(calendarDay("2026-10-01"), 365, today), "2027-10-01");
  // Across a month end, counted in days.
  assert.equal(nextDueDate(calendarDay("2026-10-25"), 14, calendarDay("2026-10-25")), "2026-11-08");
});

test("nextDueDate: never before today", () => {
  const today = calendarDay("2026-10-10");
  // Given 20 days ago on a 14-day interval: the next one was due 6 days ago.
  assert.equal(nextDueDate(calendarDay("2026-09-20"), 14, today), "2026-10-10");
  // Falling exactly on today.
  assert.equal(nextDueDate(calendarDay("2026-09-26"), 14, today), "2026-10-10");
  assert.equal(nextDueDate(calendarDay("2026-09-27"), 14, today), "2026-10-11");
});

test("futureDayIssue: today is allowed, tomorrow isn't", () => {
  assert.equal(futureDayIssue(day("2026-10-10"), day("2026-10-10"), "The onset date"), null);
  assert.equal(
    futureDayIssue(day("2026-10-11"), day("2026-10-10"), "The onset date"),
    "The onset date can't be in the future.",
  );
});

test("beforeIntakeIssue: the intake day is allowed, the day before isn't, and no intake allows any", () => {
  assert.equal(beforeIntakeIssue(day("2026-08-01"), day("2026-08-01"), "The start date"), null);
  assert.equal(
    beforeIntakeIssue(day("2026-07-31"), day("2026-08-01"), "The start date"),
    "The start date can't be before the animal's intake on Aug 1, 2026.",
  );
  assert.equal(beforeIntakeIssue(day("2020-01-01"), null, "The start date"), null);
});

test("beforeBirthIssue: the birth day is allowed, the day before isn't", () => {
  assert.equal(beforeBirthIssue(day("2024-03-03"), day("2024-03-03"), "The document date"), null);
  assert.equal(
    beforeBirthIssue(day("2024-03-02"), day("2024-03-03"), "The document date"),
    "The document date can't be before the animal's birth on Mar 3, 2024.",
  );
});
