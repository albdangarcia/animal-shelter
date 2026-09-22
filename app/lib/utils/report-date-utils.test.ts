import { test } from "node:test";
import assert from "node:assert/strict";
const SHELTER_TIMEZONE = "America/New_York";
import { formatRangeLabel, resolveReportRange as rawResolveReportRange } from "./report-date-utils";
import { calendarDay, shelterToday as rawShelterToday, shiftDayKey } from "./shelter-day";

// A range is two calendar days, inclusive at both ends, so every expectation
// here is a plain `yyyy-MM-dd` comparison.
const shelterToday = () => rawShelterToday(SHELTER_TIMEZONE);
const resolveReportRange = (from?: string, to?: string) => rawResolveReportRange(from, to, shelterToday());

const inNewYork = { skip: SHELTER_TIMEZONE !== "America/New_York" };

test("a well-formed range is used as given", () => {
  const range = resolveReportRange("2026-03-01", "2026-03-31");
  assert.equal(range.fromLabel, "2026-03-01");
  assert.equal(range.toLabel, "2026-03-31");
});

test("one day is a range of that day, at both ends", () => {
  const range = resolveReportRange("2026-03-01", "2026-03-01");
  assert.equal(range.fromLabel, "2026-03-01");
  assert.equal(range.toLabel, "2026-03-01");
});

test("a reversed range is swapped rather than refused", () => {
  const range = resolveReportRange("2026-03-31", "2026-03-01");
  assert.equal(range.fromLabel, "2026-03-01");
  assert.equal(range.toLabel, "2026-03-31");
});

test("a missing end defaults to today on the shelter's calendar", () => {
  const today = shelterToday();
  assert.equal(resolveReportRange("2026-01-05", undefined).toLabel, today);
  // A missing start is the year to date, reckoned in the same zone.
  assert.equal(
    resolveReportRange(undefined, undefined).fromLabel,
    `${today.slice(0, 4)}-01-01`,
  );
  assert.equal(resolveReportRange(undefined, undefined).toLabel, today);
});

test("unparseable input falls back to the defaults instead of throwing", () => {
  const today = shelterToday();
  for (const bad of ["", "not a date", "2026-3-1", "2026-02-30", "2026-13-01"]) {
    const range = resolveReportRange(bad, bad);
    assert.equal(range.fromLabel, `${today.slice(0, 4)}-01-01`);
    assert.equal(range.toLabel, today);
  }
});

test("a window wider than 731 days is clamped, holding the end fixed", () => {
  const range = resolveReportRange("2020-01-01", "2026-03-31");
  assert.equal(range.toLabel, "2026-03-31");
  assert.equal(range.fromLabel, shiftDayKey(range.toLabel, -731));

  // 731 days exactly is not clamped — only a wider span is.
  const atTheLimit = shiftDayKey(range.toLabel, -731);
  assert.equal(
    resolveReportRange(atTheLimit, "2026-03-31").fromLabel,
    atTheLimit,
  );
});

test("a reversed range is swapped before it is clamped", () => {
  // Otherwise the clamp would measure a negative span and leave the window
  // wide, so the two orderings have to resolve to the same range.
  assert.deepEqual(
    resolveReportRange("2026-03-31", "2020-01-01"),
    resolveReportRange("2020-01-01", "2026-03-31"),
  );
});

test("the range label shows the year once when both ends share it", () => {
  assert.equal(
    formatRangeLabel(resolveReportRange("2026-01-01", "2026-07-04")),
    "Jan 1 – Jul 4, 2026",
  );
});

test("the range label shows both years when they differ", () => {
  assert.equal(
    formatRangeLabel(resolveReportRange("2025-12-30", "2026-01-02")),
    "Dec 30, 2025 – Jan 2, 2026",
  );
});

test("today is resolved in the shelter's zone, not the server's", inNewYork, () => {
  // The only thing a range needs a timezone for. Read as the UTC day, an
  // evening request west of UTC would open a report on tomorrow.
  const utcToday = calendarDay(new Date().toISOString().slice(0, 10));
  const range = resolveReportRange(undefined, undefined);
  assert.ok(
    range.toLabel === utcToday || range.toLabel === shiftDayKey(utcToday, -1),
  );
});
