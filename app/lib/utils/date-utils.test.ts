import { test } from "node:test";
import assert from "node:assert/strict";
import { isFosterPlacementOverdue } from "./date-utils";

// Builds a Date offset from today at a fixed local wall-clock time, so these
// cases stay meaningful whenever the suite runs.
const dayOffset = (days: number, hours = 0, minutes = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

test("isFosterPlacementOverdue: no date set is never overdue", () => {
  // The open-ended foster case — LONG_TERM and FOSTER_TO_ADOPT placements
  // legitimately carry no expected return date and must never be flagged.
  assert.equal(isFosterPlacementOverdue(null), false);
  assert.equal(isFosterPlacementOverdue(undefined), false);
});

test("isFosterPlacementOverdue: a past date is overdue", () => {
  assert.equal(isFosterPlacementOverdue(dayOffset(-1)), true);
  assert.equal(isFosterPlacementOverdue(dayOffset(-4)), true);
});

test("isFosterPlacementOverdue: a placement expected back today is not yet overdue", () => {
  // Guards against regressing to timestamp-based isPast(), which would flag
  // a today placement as overdue from 00:01 onward. Matches Signal 3's
  // `expectedEndDate: { lt: startOfToday }` in attention-queue.data.ts.
  assert.equal(isFosterPlacementOverdue(dayOffset(0, 0, 0)), false);
  assert.equal(isFosterPlacementOverdue(dayOffset(0, 15, 30)), false);
  assert.equal(isFosterPlacementOverdue(dayOffset(0, 23, 59)), false);
});

test("isFosterPlacementOverdue: a future date is not overdue", () => {
  assert.equal(isFosterPlacementOverdue(dayOffset(1)), false);
  assert.equal(isFosterPlacementOverdue(dayOffset(9)), false);
});

test("isFosterPlacementOverdue: accepts a date string", () => {
  assert.equal(isFosterPlacementOverdue(dayOffset(-2).toISOString()), true);
  assert.equal(isFosterPlacementOverdue(dayOffset(2).toISOString()), false);
});
