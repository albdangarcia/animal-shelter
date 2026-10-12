import { test } from "node:test";
import assert from "node:assert/strict";
import { MedicalEntryKind, SurgeryProcedure } from "@/prisma/generated/enums";
import { medicalEntryName } from "./medical-entry-name";

test("a vaccine, test or treatment is named by its catalog item", () => {
  for (const kind of [
    MedicalEntryKind.VACCINE,
    MedicalEntryKind.TEST,
    MedicalEntryKind.TREATMENT,
  ]) {
    assert.equal(medicalEntryName({ kind, item: { name: "DHPP" } }), "DHPP");
  }
});

test("a surgery is named by its procedure, and a microchip as one", () => {
  const surgery = (procedure: SurgeryProcedure) =>
    medicalEntryName({ kind: MedicalEntryKind.SURGERY, item: null, procedure });
  assert.equal(surgery(SurgeryProcedure.SPAY), "Spay");
  assert.equal(surgery(SurgeryProcedure.MASS_REMOVAL), "Mass removal");
  assert.equal(surgery(SurgeryProcedure.OTHER), "Other surgery");
  assert.equal(
    medicalEntryName({ kind: MedicalEntryKind.MICROCHIP, item: null }),
    "Microchip",
  );
});

test("an entry missing what names it is a bug, not a blank name", () => {
  assert.throws(
    () => medicalEntryName({ kind: MedicalEntryKind.VACCINE, item: null }),
    /no catalog item/,
  );
  assert.throws(
    () =>
      medicalEntryName({ kind: MedicalEntryKind.SURGERY, item: null, procedure: null }),
    /no procedure/,
  );
});
