import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDueDay, formatDateOrNA, isFosterPlacementOverdue } from "./date-utils";
import { calendarDay, shiftDayKey } from "./shelter-day";
import { TaskStatus } from "@/prisma/generated/enums";

// A fixed day to compare against. Nothing here reads a clock, so these cases
// mean the same thing whenever and wherever the suite runs — which is the
// point of both helpers taking today as an argument.
const TODAY = calendarDay("2026-09-21");
const day = (offset: number) => shiftDayKey(TODAY, offset);

test("isFosterPlacementOverdue: no date set is never overdue", () => {
  // The open-ended foster case — LONG_TERM and FOSTER_TO_ADOPT placements
  // legitimately carry no expected return date and must never be flagged.
  assert.equal(isFosterPlacementOverdue(null, TODAY), false);
  assert.equal(isFosterPlacementOverdue(undefined, TODAY), false);
});

test("isFosterPlacementOverdue: a past day is overdue", () => {
  assert.equal(isFosterPlacementOverdue(day(-1), TODAY), true);
  assert.equal(isFosterPlacementOverdue(day(-4), TODAY), true);
});

test("isFosterPlacementOverdue: a placement expected back today is not yet overdue", () => {
  // Matches signal 3 of the attention queue, whose query is the same strict
  // comparison against the same day.
  assert.equal(isFosterPlacementOverdue(TODAY, TODAY), false);
});

test("isFosterPlacementOverdue: a future day is not overdue", () => {
  assert.equal(isFosterPlacementOverdue(day(1), TODAY), false);
  assert.equal(isFosterPlacementOverdue(day(9), TODAY), false);
});

test("isFosterPlacementOverdue: the year boundary compares correctly", () => {
  // The comparison is lexicographic, which only works because `yyyy-MM-dd` is
  // fixed-width and zero-padded. A shorter or unpadded value would break it.
  const newYear = calendarDay("2027-01-01");
  assert.equal(isFosterPlacementOverdue("2026-12-31", newYear), true);
  assert.equal(isFosterPlacementOverdue("2027-01-02", newYear), false);
});

test("formatDueDay: an undated task reads N/A", () => {
  assert.equal(formatDueDay(null, TaskStatus.TODO, TODAY), "N/A");
  assert.equal(formatDueDay(undefined, TaskStatus.TODO, TODAY), "N/A");
});

test("formatDueDay: a task due today says so rather than a zero distance", () => {
  assert.equal(formatDueDay(TODAY, TaskStatus.TODO, TODAY), "Today");
});

test("formatDueDay: an open task past its day is overdue by whole days", () => {
  assert.equal(
    formatDueDay(day(-3), TaskStatus.TODO, TODAY),
    "Overdue by 3 days",
  );
  assert.equal(
    formatDueDay(day(-1), TaskStatus.IN_PROGRESS, TODAY),
    "Overdue by 1 day",
  );
});

test("formatDueDay: a closed task past its day is not overdue", () => {
  // Only work someone is still expected to do can be late; a finished task
  // just reads as a past date.
  assert.equal(formatDueDay(day(-3), TaskStatus.DONE, TODAY), "3 days ago");
});

test("formatDueDay: a future day reads as a distance ahead", () => {
  assert.equal(formatDueDay(day(2), TaskStatus.TODO, TODAY), "in 2 days");
});

test("formatDueDay: a value that is not a day does not throw out of a cell", () => {
  // A table cell renders inside an error boundary, so a broken column value
  // has to read as broken rather than take the whole table down.
  assert.equal(
    formatDueDay("not-a-day", TaskStatus.TODO, TODAY),
    "Invalid Date",
  );
});

test("formatDateOrNA: null and undefined return N/A", () => {
  assert.equal(formatDateOrNA(null), "N/A");
  assert.equal(formatDateOrNA(undefined), "N/A");
});

test("formatDateOrNA: invalid input returns Invalid Date", () => {
  assert.equal(formatDateOrNA("not-a-date"), "Invalid Date");
});

