import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeEntryChanges,
  formatEntryFieldValue,
} from "./medical-entry-changes";

const names = { item1: "DHPP", clinic1: "Downtown Veterinary Clinic", p1: "Olivia Chen" };

test("formatEntryFieldValue: ids read as names, and a missing one says so", () => {
  assert.equal(formatEntryFieldValue("itemId", "item1", names), "DHPP");
  assert.equal(
    formatEntryFieldValue("vetPartnerId", "clinic1", names),
    "Downtown Veterinary Clinic",
  );
  assert.equal(formatEntryFieldValue("administeredById", "p1", names), "Olivia Chen");
  assert.equal(
    formatEntryFieldValue("itemId", "gone", names),
    "a record that no longer exists",
  );
});

test("formatEntryFieldValue: days, enums, durations and results read as words", () => {
  assert.equal(formatEntryFieldValue("completedDate", "2026-09-01", names), "Sep 1, 2026");
  assert.equal(formatEntryFieldValue("completedDate", null, names), "unknown");
  assert.equal(formatEntryFieldValue("lotExpiryDate", null, names), "none");
  assert.equal(formatEntryFieldValue("source", "BEFORE_INTAKE", names), "Before intake");
  assert.equal(formatEntryFieldValue("route", "SUBCUTANEOUS", names), "Subcutaneous (SQ)");
  assert.equal(formatEntryFieldValue("doseUnit", "ML", names), "mL");
  assert.equal(formatEntryFieldValue("durationMonths", 12, names), "12 months");
  assert.equal(formatEntryFieldValue("doseAmount", 2.5, names), "2.5");
  assert.equal(
    formatEntryFieldValue(
      "results",
      [
        { analyteId: "a", analyteName: "FeLV antigen", result: "NEGATIVE" },
        { analyteId: "b", analyteName: "FIV antibody", result: "POSITIVE" },
      ],
      names,
    ),
    "FeLV antigen negative, FIV antibody positive",
  );
});

test("describeEntryChanges: one row per changed field, in form order", () => {
  assert.deepEqual(
    describeEntryChanges(
      { lotNumber: "A123", completedDate: "2026-09-01" },
      { lotNumber: "B456", completedDate: "2026-09-02" },
      names,
    ),
    [
      { field: "completedDate", label: "Date given", from: "Sep 1, 2026", to: "Sep 2, 2026" },
      { field: "lotNumber", label: "Lot number", from: "A123", to: "B456" },
    ],
  );
});
