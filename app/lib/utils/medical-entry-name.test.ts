import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExamType,
  MedicalEntryKind,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { medicalEntryName } from "./medical-entry-name";
import { subjectText, verbFor } from "@/app/lib/services/medical-entry-text";

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

test("an exam is named by its type", () => {
  const exam = (examType: ExamType) =>
    medicalEntryName({ kind: MedicalEntryKind.EXAM, item: null, examType });
  assert.equal(exam(ExamType.INTAKE), "Intake exam");
  assert.equal(exam(ExamType.VET), "Vet exam");
  assert.equal(exam(ExamType.RECHECK), "Recheck exam");
  assert.equal(exam(ExamType.PRE_ADOPTION), "Pre-adoption exam");
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
  assert.throws(
    () => medicalEntryName({ kind: MedicalEntryKind.EXAM, item: null, examType: null }),
    /no exam type/,
  );
});


test("outcome-owned entries have names without a catalog item or procedure", () => {
  assert.equal(medicalEntryName({ kind: MedicalEntryKind.EUTHANASIA, item: null }), "Euthanasia");
  assert.equal(medicalEntryName({ kind: MedicalEntryKind.DEATH, item: null }), "Death");
});

test("end-of-life activity subjects avoid ordinary-care nouns and verbs", () => {
  assert.equal(subjectText({ kind: "EUTHANASIA", item: null }), "Euthanasia");
  assert.equal(subjectText({ kind: "DEATH", item: null }), "Death");
  assert.equal(verbFor("EUTHANASIA", "OUTSIDE_VET"), "performed");
  assert.equal(verbFor("DEATH", null), "recorded");
});
