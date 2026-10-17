import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDICAL_ENTRY_KIND_LABELS, ORDINARY_CARE_KINDS, isOrdinaryCareKind, isCatalogEntryKind } from "./medical";

test("ordinary care choices retain their kinds without offering outcome-owned events", () => {
  assert.deepEqual(ORDINARY_CARE_KINDS, ["VACCINE", "TEST", "TREATMENT", "SURGERY", "MICROCHIP", "EXAM"]);
  for (const kind of ["EUTHANASIA", "DEATH"] as const) {
    assert.equal(isOrdinaryCareKind(kind), false);
    assert.equal(isCatalogEntryKind(kind), false);
  }
  assert.equal(MEDICAL_ENTRY_KIND_LABELS.EUTHANASIA, "Euthanasia");
  assert.equal(MEDICAL_ENTRY_KIND_LABELS.DEATH, "Death");
});
