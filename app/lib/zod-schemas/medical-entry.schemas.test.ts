import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  MedicalEntryFormSchema,
  ScheduleMedicalEntrySchema,
  VoidMedicalEntrySchema,
  rabiesDurationIssue,
  type MedicalEntryFormInput,
} from "./medical-entry.schemas";

const vaccine: MedicalEntryFormInput = {
  kind: "VACCINE",
  itemId: "item",
  completedDate: "2026-09-01",
  source: "IN_HOUSE",
  lotNumber: "",
  durationMonths: null,
};

// The action hands these to the form as they are, so each message has to be
// keyed to the field the form shows it under.
const fieldErrorsOf = (
  values: MedicalEntryFormInput,
): Record<string, string[] | undefined> => {
  const result = MedicalEntryFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors;
};

test("MedicalEntryFormSchema: days parse, and blank text reads as null", () => {
  const result = MedicalEntryFormSchema.parse({
    ...vaccine,
    lotNumber: "  ",
    lotExpiryDate: "",
    notes: "  Calm. ",
  });
  assert.equal(result.completedDate, "2026-09-01");
  assert.equal(result.kind === "VACCINE" && result.lotNumber, null);
  assert.equal(result.kind === "VACCINE" && result.lotExpiryDate, null);
  assert.equal(result.notes, "Calm.");
  assert.ok(fieldErrorsOf({ ...vaccine, completedDate: "2026-02-30" }).completedDate);
});

test("MedicalEntryFormSchema: only care before intake may leave the date unknown", () => {
  for (const source of ["IN_HOUSE", "OUTSIDE_VET"] as const) {
    assert.ok(
      fieldErrorsOf({ ...vaccine, source, completedDate: "" }).completedDate,
    );
  }
  const result = MedicalEntryFormSchema.parse({
    ...vaccine,
    source: "BEFORE_INTAKE",
    completedDate: null,
  });
  assert.equal(result.completedDate, null);
});

test("MedicalEntryFormSchema: a vet clinic or vet's name is refused for in-house care", () => {
  const errors = fieldErrorsOf({
    ...vaccine,
    vetPartnerId: "c00000000000000000000000",
    vetName: "Dr. Ruiz",
  });
  assert.ok(errors.vetPartnerId);
  assert.ok(errors.vetName);
  assert.equal(
    MedicalEntryFormSchema.safeParse({
      ...vaccine,
      source: "OUTSIDE_VET",
      vetName: "Dr. Ruiz",
    }).success,
    true,
  );
});

test("MedicalEntryFormSchema: a rabies duration is a whole number of months, 1 to 36", () => {
  for (const durationMonths of [0, 37, 1.5]) {
    assert.ok(fieldErrorsOf({ ...vaccine, durationMonths }).durationMonths);
  }
  assert.equal(
    MedicalEntryFormSchema.safeParse({ ...vaccine, durationMonths: 36 }).success,
    true,
  );
  assert.equal(rabiesDurationIssue(true, null), "A rabies vaccine needs its duration.");
  assert.equal(rabiesDurationIssue(true, 12), null);
  assert.equal(rabiesDurationIssue(false, null), null);
});

test("MedicalEntryFormSchema: a treatment's dose is positive and has a unit", () => {
  const treatment: MedicalEntryFormInput = {
    kind: "TREATMENT",
    itemId: "item",
    completedDate: "2026-09-01",
    source: "IN_HOUSE",
  };
  assert.ok(fieldErrorsOf({ ...treatment, doseAmount: 0, doseUnit: "ML" }).doseAmount);
  assert.ok(fieldErrorsOf({ ...treatment, doseAmount: 2 }).doseUnit);
  assert.equal(
    MedicalEntryFormSchema.safeParse({ ...treatment, doseAmount: 2, doseUnit: "ML" })
      .success,
    true,
  );
});

test("MedicalEntryFormSchema: every test result is chosen", () => {
  assert.ok(
    fieldErrorsOf({
      kind: "TEST",
      itemId: "item",
      completedDate: "2026-09-01",
      source: "IN_HOUSE",
      results: [{ analyteId: "a", result: undefined as never }],
    }).results,
  );
});

test("VoidMedicalEntrySchema: the reason is required and kept trimmed", () => {
  assert.equal(VoidMedicalEntrySchema.safeParse({ reason: "  " }).success, false);
  assert.deepEqual(VoidMedicalEntrySchema.parse({ reason: " Wrong animal. " }), {
    reason: "Wrong animal.",
  });
});

test("ScheduleMedicalEntrySchema: the due date is required and a real day", () => {
  const base = { kind: "VACCINE", itemId: "item", notes: "  " } as const;
  const parsed = ScheduleMedicalEntrySchema.parse({ ...base, dueDate: "2026-10-14" });
  assert.equal(parsed.dueDate, "2026-10-14");
  assert.equal(parsed.notes, null);
  for (const dueDate of [undefined, "", "2026-02-30"]) {
    const result = ScheduleMedicalEntrySchema.safeParse({ ...base, dueDate });
    assert.equal(result.success, false, String(dueDate));
    assert.ok(z.flattenError(result.error!).fieldErrors.dueDate, String(dueDate));
  }
});
