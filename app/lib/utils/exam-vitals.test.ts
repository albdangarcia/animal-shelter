import { test } from "node:test";
import assert from "node:assert/strict";
import { examVitalsInstant } from "./exam-vitals";
import { calendarDay } from "./shelter-day";

const LOS_ANGELES = "America/Los_Angeles";

test("an exam done today measured its vitals now", () => {
  const now = new Date("2026-10-13T18:42:07.123Z");
  assert.equal(
    examVitalsInstant(calendarDay("2026-10-13"), calendarDay("2026-10-13"), LOS_ANGELES, now)
      .toISOString(),
    now.toISOString(),
  );
});

test("an exam on an earlier day measured them as that day began in the shelter", () => {
  const now = new Date("2026-10-13T18:42:07.123Z");
  assert.equal(
    examVitalsInstant(calendarDay("2026-10-03"), calendarDay("2026-10-13"), LOS_ANGELES, now)
      .toISOString(),
    // Midnight in Los Angeles, on daylight time.
    "2026-10-03T07:00:00.000Z",
  );
});

test("a day the clocks change begins at the shelter's midnight, not UTC's", () => {
  const now = new Date("2026-11-20T18:00:00.000Z");
  // Clocks go back at 2am on Nov 1, 2026, so midnight that day is still on
  // daylight time, and the day after it on standard time.
  assert.equal(
    examVitalsInstant(calendarDay("2026-11-01"), calendarDay("2026-11-20"), LOS_ANGELES, now)
      .toISOString(),
    "2026-11-01T07:00:00.000Z",
  );
  assert.equal(
    examVitalsInstant(calendarDay("2026-11-02"), calendarDay("2026-11-20"), LOS_ANGELES, now)
      .toISOString(),
    "2026-11-02T08:00:00.000Z",
  );
});
