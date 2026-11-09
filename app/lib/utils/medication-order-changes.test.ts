import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMedicationOrderChanges } from "./medication-order-changes";

test("a correction reads field by field, in the form's order, with days and slots in words", () => {
  assert.deepEqual(
    describeMedicationOrderChanges(
      { instructions: null, endDate: "2026-11-10", firstSlot: "AM", startDate: "2026-10-12" },
      { instructions: "With food.", endDate: null, firstSlot: "MIDDAY", startDate: "2026-10-13" },
    ),
    [
      { field: "startDate", label: "Start date", from: "Oct 12, 2026", to: "Oct 13, 2026" },
      { field: "firstSlot", label: "First dose", from: "AM", to: "Midday" },
      { field: "endDate", label: "End date", from: "Nov 10, 2026", to: "until discontinued" },
      { field: "instructions", label: "Instructions", from: "none", to: "With food." },
    ],
  );
});

test("a discontinue reads its day and reason", () => {
  assert.deepEqual(
    describeMedicationOrderChanges(
      { discontinuedDate: null },
      { discontinuedDate: "2026-10-14", discontinueReason: "Stools normal again" },
    ),
    [
      { field: "discontinuedDate", label: "Discontinued from", from: "none", to: "Oct 14, 2026" },
      { field: "discontinueReason", label: "Reason", from: "none", to: "Stools normal again" },
    ],
  );
  assert.deepEqual(describeMedicationOrderChanges(null, undefined), []);
});
