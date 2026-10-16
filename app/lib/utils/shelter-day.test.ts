import { test } from "node:test";
import assert from "node:assert/strict";
const SHELTER_TIMEZONE = "America/New_York";
import { resolveReportRange as rawResolveReportRange } from "./report-date-utils";
import {
  calendarDay,
  countByShelterDay,
  formatShelterDay,
  formatShelterDayOrNA,
  formatTimeOfDay,
  parseCalendarDay,
  shelterDayKey as rawShelterDayKey,
  shelterToday as rawShelterToday,
  shelterDaysBetween as rawShelterDaysBetween,
  shelterClock,
  shelterInstant,
  shelterNow,
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

test("where the clocks spring forward at midnight, the day begins when the jump lands", () => {
  // Each of these days has no 00:00: the clocks go from 23:59 to 01:00. Read
  // at the old offset, 00:00 would be 23:00 the evening before.
  const cases: [string, string, string][] = [
    // Santiago, Sep 6, 2026: from UTC-4 to UTC-3.
    ["America/Santiago", "2026-09-06", "2026-09-06T04:00:00Z"],
    // Havana, Mar 8, 2026: from UTC-5 to UTC-4.
    ["America/Havana", "2026-03-08", "2026-03-08T05:00:00Z"],
    // Beirut, Mar 29, 2026: from UTC+2 to UTC+3.
    ["Asia/Beirut", "2026-03-29", "2026-03-28T22:00:00Z"],
  ];
  for (const [timezone, value, expected] of cases) {
    const start = rawStartOfShelterDay(day(value), timezone);
    assert.deepEqual(start, utc(expected), timezone);
    assert.equal(rawShelterDayKey(start, timezone), value, timezone);
    // A minute earlier is still the day before.
    assert.equal(
      rawShelterDayKey(new Date(start.getTime() - 60_000), timezone),
      shiftDayKey(day(value), -1),
      timezone,
    );
  }
});

test("a day begins at its first instant, however the clock changed around midnight", () => {
  const cases: [string, string, string][] = [
    // Colombo, Apr 15, 2006: at 00:30 the clocks went back to 00:00, so the
    // day's 00:00 came twice; it begins at the first.
    ["Asia/Colombo", "2006-04-15", "2006-04-14T18:00:00Z"],
    // Goose Bay, Nov 4, 2007: at 00:01 the clocks went back to 23:01 on the
    // day before, so the day's first minute came an hour before its second.
    ["America/Goose_Bay", "2007-11-04", "2007-11-04T03:00:00Z"],
    // Vostok, Nov 1, 1994: a jump of seven hours.
    ["Antarctica/Vostok", "1994-11-01", "1994-11-01T00:00:00Z"],
    // Monrovia, Jan 7, 1972: an offset of 44 minutes 30 seconds ended.
    ["Africa/Monrovia", "1972-01-07", "1972-01-07T00:44:30Z"],
  ];
  for (const [timezone, value, expected] of cases) {
    const start = rawStartOfShelterDay(day(value), timezone);
    assert.deepEqual(start, utc(expected), timezone);
    assert.equal(rawShelterDayKey(start, timezone), value, timezone);
    assert.equal(
      rawShelterDayKey(new Date(start.getTime() - 1), timezone),
      shiftDayKey(day(value), -1),
      timezone,
    );
  }
  // The first day there is: the day before it is year zero, 1 BC.
  const yearOne = new Date(0);
  yearOne.setUTCFullYear(1, 0, 1);
  assert.deepEqual(rawStartOfShelterDay(day("0001-01-01"), "UTC"), yearOne);
  // Apia skipped Dec 30, 2011 whole: it reads as the start of Dec 31.
  assert.deepEqual(
    rawStartOfShelterDay(day("2011-12-30"), "Pacific/Apia"),
    utc("2011-12-30T10:00:00Z"),
  );
  assert.equal(
    rawShelterDayKey(utc("2011-12-30T10:00:00Z"), "Pacific/Apia"),
    "2011-12-31",
  );
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

test("the shelter's clock reads its day and time of day, as today does", () => {
  const at = new Date("2026-10-15T14:05:30Z");
  assert.deepEqual(shelterClock(at, "America/New_York"), {
    day: "2026-10-15",
    time: "10:05",
  });
  assert.equal(shelterClock(at, "America/New_York").day, rawShelterToday("America/New_York", at));
  // Midnight reads 00:00, never 24:00.
  assert.deepEqual(shelterClock(new Date("2026-10-15T04:00:00Z"), "America/New_York"), {
    day: "2026-10-15",
    time: "00:00",
  });
});

test("the shelter's clock jumps with a spring-forward and repeats the fall-back hour", () => {
  // New York springs forward at 02:00 on Mar 8, 2026: 01:59 is followed by 03:00.
  assert.equal(shelterClock(new Date("2026-03-08T06:59:00Z"), "America/New_York").time, "01:59");
  assert.deepEqual(shelterClock(new Date("2026-03-08T07:30:00Z"), "America/New_York"), {
    day: "2026-03-08",
    time: "03:30",
  });
  // And falls back at 02:00 on Nov 1, 2026: 01:30 comes twice, an hour apart.
  const first = shelterClock(new Date("2026-11-01T05:30:00Z"), "America/New_York");
  const second = shelterClock(new Date("2026-11-01T06:30:00Z"), "America/New_York");
  assert.deepEqual(first, { day: "2026-11-01", time: "01:30" });
  assert.deepEqual(second, first);
});

test("east of UTC the shelter's clock is on a later day than UTC's", () => {
  const at = new Date("2026-10-15T20:00:00Z");
  assert.deepEqual(shelterClock(at, "Asia/Tokyo"), { day: "2026-10-16", time: "05:00" });
  assert.equal(shelterClock(at, "Asia/Tokyo").day, rawShelterDayKey(at, "Asia/Tokyo"));
});

test("a time of day reads on a twelve-hour clock", () => {
  assert.equal(formatTimeOfDay("00:05"), "12:05 AM");
  assert.equal(formatTimeOfDay("09:30"), "9:30 AM");
  assert.equal(formatTimeOfDay("12:00"), "12:00 PM");
  assert.equal(formatTimeOfDay("20:00"), "8:00 PM");
  assert.equal(formatTimeOfDay("23:59"), "11:59 PM");
});

test("one reading of the shelter's time gives today and the clock from the same instant", () => {
  // The last millisecond of Oct 14 in New York, and the first of Oct 15.
  for (const [at, day, time] of [
    ["2026-10-15T03:59:59.999Z", "2026-10-14", "23:59"],
    ["2026-10-15T04:00:00.000Z", "2026-10-15", "00:00"],
  ] as const) {
    const now = new Date(at);
    const reading = shelterNow(now, "America/New_York");
    assert.equal(reading.now, now);
    assert.deepEqual(reading.clock, { day, time });
    assert.equal(reading.today, reading.clock.day);
    assert.equal(reading.today, rawShelterToday("America/New_York", now));
  }
});

test("a day and a time on the shelter's clock is the instant the clock reads them", () => {
  const day = calendarDay("2026-10-15");
  assert.equal(shelterInstant(day, "08:12", "America/New_York").toISOString(), "2026-10-15T12:12:00.000Z");
  assert.equal(shelterInstant(day, "00:00", "America/New_York").toISOString(), "2026-10-15T04:00:00.000Z");
  assert.equal(shelterInstant(day, "23:59", "America/New_York").toISOString(), "2026-10-16T03:59:00.000Z");
  // East of UTC the instant is on the day before UTC's.
  assert.equal(shelterInstant(day, "05:00", "Asia/Tokyo").toISOString(), "2026-10-14T20:00:00.000Z");
  // Read back, it is the same day and time.
  const at = shelterInstant(day, "19:45", "America/Los_Angeles");
  assert.deepEqual(shelterClock(at, "America/Los_Angeles"), { day, time: "19:45" });
});

test("a skipped time reads as the jump's landing, a repeated one as the first", () => {
  // New York springs forward at 02:00 on Mar 8, 2026: 02:30 never happens,
  // and the clock reads 03:00 at 07:00Z.
  const spring = calendarDay("2026-03-08");
  assert.equal(shelterInstant(spring, "02:30", "America/New_York").toISOString(), "2026-03-08T07:00:00.000Z");
  assert.equal(shelterInstant(spring, "01:59", "America/New_York").toISOString(), "2026-03-08T06:59:00.000Z");
  assert.equal(shelterInstant(spring, "03:00", "America/New_York").toISOString(), "2026-03-08T07:00:00.000Z");
  // And falls back at 02:00 on Nov 1, 2026: 01:30 comes at 05:30Z and 06:30Z.
  const fall = calendarDay("2026-11-01");
  assert.equal(shelterInstant(fall, "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(shelterInstant(fall, "02:30", "America/New_York").toISOString(), "2026-11-01T07:30:00.000Z");
  // A midnight the clock skips is when the day begins.
  const santiago = calendarDay("2026-09-06");
  assert.equal(
    shelterInstant(santiago, "00:00", "America/Santiago").toISOString(),
    rawStartOfShelterDay(santiago, "America/Santiago").toISOString(),
  );
});
