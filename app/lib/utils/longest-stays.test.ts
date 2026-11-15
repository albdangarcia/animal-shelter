import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "./shelter-day";
import type { StayEvent } from "./stay-utils";
import {
  summarizeLengthOfStay,
  type AnimalStayHistory,
} from "./length-of-stay";
import { resolveReportRange } from "./report-date-utils";
import {
  LONGEST_STAYS_SHOWN,
  inCareLine,
  over90Line,
  returnedNote,
  stayDays,
  summarizeLongestStays,
} from "./longest-stays";

// Stays are counted in calendar days, so nothing here depends on a timezone.
const day = calendarDay;
const intake = (d: string): StayEvent => ({ kind: "intake", date: day(d) });
const outcome = (d: string): StayEvent => ({ kind: "outcome", date: day(d) });

const TODAY = day("2026-09-30");

const animal = (name: string, events: StayEvent[]): AnimalStayHistory => ({
  id: `id-${name}`,
  name,
  speciesName: "Dog",
  events,
});

// Eight in care (more than the card shows), two of them tied on the current
// stay, one exactly 90 days in (not over), two over 90, and two that left.
const ANIMALS = [
  animal("Ninety", [intake("2026-07-02")]), // 90 days: not over
  animal("Ninety-one", [intake("2026-07-01")]), // 91 days
  animal("Long", [intake("2026-01-05")]), // 268 days
  animal("Tie b", [intake("2026-09-20")]), // 10 days
  animal("Tie a", [intake("2026-09-20")]), // 10 days, same cumulative: by name
  animal("Back again", [
    intake("2026-03-01"),
    outcome("2026-03-11"),
    intake("2026-09-20"),
  ]), // 10 days, 20 in all: ahead of the ties
  animal("Today", [intake("2026-09-30")]), // 0 days
  animal("Week", [intake("2026-09-23")]), // 7 days
  animal("Adopted", [intake("2026-01-01"), outcome("2026-02-01")]),
  animal("Never here", []),
];

test("the card's rows are the report's first rows, in its order", () => {
  const card = summarizeLongestStays(ANIMALS, TODAY);
  const report = summarizeLengthOfStay(
    ANIMALS,
    resolveReportRange(undefined, undefined, TODAY),
    TODAY,
  );

  assert.equal(card.rows.length, LONGEST_STAYS_SHOWN);
  assert.deepEqual(card.rows, report.worklist.slice(0, LONGEST_STAYS_SHOWN));
  assert.deepEqual(
    card.rows.map((row) => row.name),
    ["Long", "Ninety-one", "Ninety", "Back again", "Tie a"],
  );
});

test("the counts are the report's, over every animal in care, not the five", () => {
  const card = summarizeLongestStays(ANIMALS, TODAY);

  assert.equal(card.inCareNow, 8);
  // Strictly over 90: "Ninety" is not counted.
  assert.equal(card.over90, 2);
});

test("no history in care gives no rows and zero counts", () => {
  assert.deepEqual(
    summarizeLongestStays(
      [animal("Adopted", [intake("2026-01-01"), outcome("2026-02-01")])],
      TODAY,
    ),
    { inCareNow: 0, over90: 0, rows: [] },
  );
});

test("days read singular and plural", () => {
  assert.equal(stayDays(0), "0 days");
  assert.equal(stayDays(1), "1 day");
  assert.equal(stayDays(12), "12 days");
});

test("the summary line names none over 90 days rather than 0", () => {
  assert.equal(inCareLine(1), "1 in care");
  assert.equal(inCareLine(12), "12 in care");
  assert.equal(over90Line(0), "none over 90 days");
  assert.equal(over90Line(1), "1 over 90 days");
  assert.equal(over90Line(3), "3 over 90 days");
});

test("the returned note shows only for an animal in care before", () => {
  const { rows } = summarizeLongestStays(ANIMALS, TODAY);
  const byName = (name: string) => rows.find((row) => row.name === name)!;

  assert.equal(returnedNote(byName("Back again")), "returned · 20 days in all");
  assert.equal(returnedNote(byName("Long")), null);
  assert.equal(
    returnedNote({ ...byName("Back again"), cumulativeDays: 1 }),
    "returned · 1 day in all",
  );
});
