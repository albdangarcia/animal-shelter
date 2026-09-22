import { test } from "node:test";
import assert from "node:assert/strict";
const SHELTER_TIMEZONE = "America/New_York";
import { resolveReportRange as rawResolveReportRange } from "./report-date-utils";
import {
  calendarDay,
  countByShelterDay,
  formatShelterDay,
  formatShelterDayOrNA,
  parseCalendarDay,
  shelterDayKey as rawShelterDayKey,
  shelterToday as rawShelterToday,
  shelterDaysBetween as rawShelterDaysBetween,
  shelterDaysBetweenKeys,
  shiftDayKey,
  startOfShelterDay as rawStartOfShelterDay,
} from "./shelter-day";

// The instants below are written as UTC literals for America/New_York, so the
// expectations do not depend on the machine running the tests. They only mean
// what they say when the shelter is in that zone.

const shelterDayKey = (date: Date) => rawShelterDayKey(date, SHELTER_TIMEZONE);
const shelterToday = (now?: Date) => rawShelterToday(SHELTER_TIMEZONE, now);
const startOfShelterDay = (day: Parameters<typeof rawStartOfShelterDay>[0]) => rawStartOfShelterDay(day, SHELTER_TIMEZONE);
const shelterDaysBetween = (since: Date, now: Date) => rawShelterDaysBetween(since, now, SHELTER_TIMEZONE);

const resolveReportRange = (from?: string, to?: string) => rawResolveReportRange(from, to, shelterToday());

const inNewYork = { skip: SHELTER_TIMEZONE !== "America/New_York" };
const utc = (iso: string) => new Date(iso);
const day = calendarDay;

test("a day is parsed only from the exact yyyy-MM-dd shape", () => {
  assert.equal(parseCalendarDay("2026-09-18"), "2026-09-18");
  assert.equal(parseCalendarDay("2026-9-18"), null);
  assert.equal(parseCalendarDay("2026-09-18T00:00:00Z"), null);
  assert.equal(parseCalendarDay(" 2026-09-18 "), null);
  assert.equal(parseCalendarDay(""), null);
  assert.equal(parseCalendarDay(undefined), null);
  assert.equal(parseCalendarDay(new Date("2026-09-18")), null);
});

test("a date that does not exist is not a day", () => {
  assert.equal(parseCalendarDay("2026-02-30"), null);
  assert.equal(parseCalendarDay("2026-13-01"), null);
  // 2026 is not a leap year; 2028 is.
  assert.equal(parseCalendarDay("2026-02-29"), null);
  assert.equal(parseCalendarDay("2028-02-29"), "2028-02-29");
});

test("the trusted constructor refuses a value that is not a day", () => {
  assert.equal(calendarDay("2026-09-18"), "2026-09-18");
  assert.throws(() => calendarDay("2026-09-18T04:00:00Z"), /Not a calendar day/);
});

test("a day renders the same wherever it is read", () => {
  assert.equal(formatShelterDay(day("2026-09-18")), "Sep 18, 2026");
  assert.equal(formatShelterDay(day("2026-01-01")), "Jan 1, 2026");
});

test("an instant late in the shelter day belongs to that day, not the UTC one", inNewYork, () => {
  // 23:30 on Sep 18 in New York is already Sep 19 in UTC.
  assert.equal(shelterDayKey(utc("2026-09-19T03:30:00Z")), "2026-09-18");
  // 00:05 on Sep 18 in New York is 04:05 UTC.
  assert.equal(shelterDayKey(utc("2026-09-18T04:05:00Z")), "2026-09-18");
  // 21:00 on Sep 17 in New York is 01:00 UTC on Sep 18.
  assert.equal(shelterDayKey(utc("2026-09-18T01:00:00Z")), "2026-09-17");
});

test("the day boundary is midnight in the shelter's zone, to the millisecond", inNewYork, () => {
  const midnight = utc("2026-09-18T04:00:00.000Z");
  assert.equal(shelterDayKey(midnight), "2026-09-18");
  assert.equal(shelterDayKey(new Date(midnight.getTime() - 1)), "2026-09-17");
});

test("a day and the instant it begins at are inverses", inNewYork, () => {
  const start = startOfShelterDay(day("2026-09-18"));
  assert.deepEqual(start, utc("2026-09-18T04:00:00Z"));
  assert.equal(shelterDayKey(start), "2026-09-18");
});

test("across a DST change, a day begins at the offset in force", inNewYork, () => {
  // Mar 8, 2026 is the 23-hour day: midnight is still EST (UTC-5), the next
  // midnight is EDT (UTC-4).
  assert.deepEqual(
    startOfShelterDay(day("2026-03-08")),
    utc("2026-03-08T05:00:00Z"),
  );
  assert.deepEqual(
    startOfShelterDay(day("2026-03-09")),
    utc("2026-03-09T04:00:00Z"),
  );
  // Nov 1, 2026 is the 25-hour day: midnight is EDT, the next is EST.
  assert.deepEqual(
    startOfShelterDay(day("2026-11-01")),
    utc("2026-11-01T04:00:00Z"),
  );
  assert.deepEqual(
    startOfShelterDay(day("2026-11-02")),
    utc("2026-11-02T05:00:00Z"),
  );
  assert.equal(shelterDayKey(utc("2026-11-02T04:59:59Z")), "2026-11-01");
  assert.equal(shelterDayKey(utc("2026-11-02T05:00:00Z")), "2026-11-02");
});

test("a report of one day counts that day, and no other", () => {
  // Both ends of a range are inclusive, so a stored day compares against them
  // as plain strings.
  const stored = day("2026-09-18");
  const onTheDay = resolveReportRange("2026-09-18", "2026-09-18");
  const dayBefore = resolveReportRange("2026-09-17", "2026-09-17");
  assert.ok(stored >= onTheDay.fromLabel && stored <= onTheDay.toLabel);
  assert.ok(!(stored >= dayBefore.fromLabel && stored <= dayBefore.toLabel));
});

test("days between are counted on the calendar, not in 24-hour spans", () => {
  assert.equal(shelterDaysBetweenKeys(day("2026-09-12"), day("2026-09-13")), 1);
  assert.equal(shelterDaysBetweenKeys(day("2026-09-12"), day("2026-09-12")), 0);
  // The 23-hour and 25-hour days still count as one day each.
  assert.equal(shelterDaysBetweenKeys(day("2026-03-08"), day("2026-03-09")), 1);
  assert.equal(shelterDaysBetweenKeys(day("2026-10-31"), day("2026-11-02")), 2);
});

test("days between never goes negative", () => {
  assert.equal(shelterDaysBetweenKeys(day("2026-09-14"), day("2026-09-12")), 0);
});

test("days between two instants counts the days they fall on", inNewYork, () => {
  // Late evening to early morning the next day is one day, not zero.
  assert.equal(
    shelterDaysBetween(utc("2026-09-12T03:30:00Z"), utc("2026-09-12T04:30:00Z")),
    1,
  );
  // Any two times on one shelter day are zero apart.
  assert.equal(
    shelterDaysBetween(utc("2026-09-12T04:05:00Z"), utc("2026-09-13T03:55:00Z")),
    0,
  );
  // Noon to noon across the 23-hour day is two days, whatever the hours say.
  assert.equal(
    shelterDaysBetween(utc("2026-03-07T17:00:00Z"), utc("2026-03-09T16:00:00Z")),
    2,
  );
  // And 49 hours from Oct 31 noon to Nov 2 noon is still two.
  assert.equal(
    shelterDaysBetween(utc("2026-10-31T16:00:00Z"), utc("2026-11-02T17:00:00Z")),
    2,
  );
});

test("a missing day reads N/A", () => {
  assert.equal(formatShelterDayOrNA(null), "N/A");
  assert.equal(formatShelterDayOrNA(undefined), "N/A");
  assert.equal(formatShelterDayOrNA("2026-09-18"), "Sep 18, 2026");
});

test("a value that is not a day reads Invalid Date instead of throwing", () => {
  // A table cell renders this directly, so one unreadable value must not take
  // the surrounding table down with it.
  assert.equal(formatShelterDayOrNA(""), "Invalid Date");
  assert.equal(formatShelterDayOrNA("not a date"), "Invalid Date");
  // An instant is not a day, and must not be quietly read as one.
  assert.equal(
    formatShelterDayOrNA("2026-09-19T03:30:00.000Z"),
    "Invalid Date",
  );
});

test("shifting a day moves whole calendar days across month, year and leap boundaries", () => {
  assert.equal(shiftDayKey(day("2026-09-18"), 0), "2026-09-18");
  assert.equal(shiftDayKey(day("2026-09-18"), 12), "2026-09-30");
  assert.equal(shiftDayKey(day("2026-09-30"), 1), "2026-10-01");
  assert.equal(shiftDayKey(day("2026-01-01"), -1), "2025-12-31");
  assert.equal(shiftDayKey(day("2028-02-28"), 1), "2028-02-29");
  assert.equal(shiftDayKey(day("2026-09-18"), -90), "2026-06-20");
});

test("a two-digit year is the year it says, not one in the 1900s", () => {
  // `Date.UTC` reads a year of 0 to 99 as 1900 to 1999. The day arithmetic
  // must not.
  assert.equal(shiftDayKey(day("0099-12-31"), 1), "0100-01-01");
  assert.equal(shelterDaysBetweenKeys(day("0099-01-01"), day("0099-01-08")), 7);
});

test("shifting a day across a DST change still moves by calendar days", () => {
  assert.equal(shiftDayKey(day("2026-03-07"), 2), "2026-03-09");
  assert.equal(shiftDayKey(day("2026-10-31"), 2), "2026-11-02");
});

test("counting by day groups the days that are equal", () => {
  const counts = countByShelterDay([
    day("2026-09-18"),
    day("2026-09-18"),
    day("2026-09-18"),
    day("2026-09-19"),
  ]);
  assert.deepEqual([...counts].sort(), [
    ["2026-09-18", 3],
    ["2026-09-19", 1],
  ]);
});
