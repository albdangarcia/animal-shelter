import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDay } from "../utils/shelter-day";
import { resolveDashboardMonthBoundaries } from "./dashboard-month-boundaries";

test("dashboard month starts use the shelter day when UTC is on a different day", () => {
  const boundaries = resolveDashboardMonthBoundaries(
    calendarDay("2026-04-15"),
    "Pacific/Auckland",
  );

  assert.equal(boundaries.currentMonthFromDay, "2026-04-01");
  assert.equal(boundaries.lastMonthFromDay, "2026-03-01");
  assert.deepEqual(
    boundaries.startOfCurrentMonth,
    new Date("2026-03-31T11:00:00.000Z"),
  );
});

test("dashboard month boundaries roll over January without local Date arithmetic", () => {
  const boundaries = resolveDashboardMonthBoundaries(
    calendarDay("2026-01-20"),
    "America/New_York",
  );

  assert.equal(boundaries.currentMonthFromDay, "2026-01-01");
  assert.equal(boundaries.lastMonthFromDay, "2025-12-01");
  assert.equal(boundaries.lastMonthToDay, "2025-12-31");
});

test("a month that begins on a DST change still starts at local midnight", () => {
  const boundaries = resolveDashboardMonthBoundaries(
    calendarDay("2026-11-12"),
    "America/New_York",
  );

  assert.deepEqual(
    boundaries.startOfCurrentMonth,
    new Date("2026-11-01T04:00:00.000Z"),
  );
});
