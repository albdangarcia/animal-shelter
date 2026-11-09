import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  MedicalConditionFormSchema,
  VoidMedicalConditionSchema,
  type MedicalConditionFormInput,
} from "./medical-condition.schemas";

const condition: MedicalConditionFormInput = {
  type: "CONDITION",
  name: "Heartworm disease",
  status: "ACTIVE",
  onsetDate: "",
  resolvedDate: "",
  diagnosedBy: "",
  sourceEntryId: "",
  characteristicId: "",
  notes: "",
};

const fieldErrorsOf = (values: MedicalConditionFormInput) => {
  const result = MedicalConditionFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
};

test("MedicalConditionFormSchema: text is trimmed, and blanks read as none", () => {
  assert.deepEqual(
    MedicalConditionFormSchema.parse({
      ...condition,
      name: "  Heartworm disease ",
      onsetDate: "2026-09-03",
      notes: "  ",
    }),
    {
      type: "CONDITION",
      name: "Heartworm disease",
      status: "ACTIVE",
      onsetDate: "2026-09-03",
      resolvedDate: null,
      diagnosedBy: null,
      sourceEntryId: null,
      characteristicId: null,
      notes: null,
    },
  );
});

test("MedicalConditionFormSchema: the name is required and at most 120 characters", () => {
  assert.deepEqual(fieldErrorsOf({ ...condition, name: "   " }).name, [
    "The name is required.",
  ]);
  assert.deepEqual(fieldErrorsOf({ ...condition, name: "x".repeat(121) }).name, [
    "The name can't be longer than 120 characters.",
  ]);
  assert.equal(
    MedicalConditionFormSchema.safeParse({ ...condition, name: "x".repeat(120) }).success,
    true,
  );
});

test("MedicalConditionFormSchema: a resolved day only, and always, when resolved", () => {
  assert.deepEqual(fieldErrorsOf({ ...condition, status: "RESOLVED" }).resolvedDate, [
    "Give the day it resolved.",
  ]);
  assert.deepEqual(
    fieldErrorsOf({ ...condition, status: "CHRONIC", resolvedDate: "2026-10-01" })
      .resolvedDate,
    ["Only a resolved condition has a resolved date."],
  );
  assert.deepEqual(
    fieldErrorsOf({
      ...condition,
      status: "RESOLVED",
      onsetDate: "2026-10-02",
      resolvedDate: "2026-10-01",
    }).resolvedDate,
    ["The resolved date can't be before the onset date."],
  );
  assert.equal(
    MedicalConditionFormSchema.safeParse({
      ...condition,
      status: "RESOLVED",
      onsetDate: "2026-10-01",
      resolvedDate: "2026-10-01",
    }).success,
    true,
  );
});

test("MedicalConditionFormSchema: the type and status are picked", () => {
  const errors = fieldErrorsOf({
    ...condition,
    type: "" as MedicalConditionFormInput["type"],
    status: "" as MedicalConditionFormInput["status"],
  });
  assert.deepEqual(errors.type, ["Pick condition or allergy."]);
  assert.deepEqual(errors.status, ["Pick the status."]);
});

test("VoidMedicalConditionSchema: the reason is required", () => {
  const result = VoidMedicalConditionSchema.safeParse({ reason: "  " });
  assert.equal(result.success, false);
  assert.deepEqual(VoidMedicalConditionSchema.parse({ reason: " Wrong animal. " }), {
    reason: "Wrong animal.",
  });
});
