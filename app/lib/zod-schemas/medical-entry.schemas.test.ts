import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  MedicalBatchSchema,
  MedicalEntryFormSchema,
  RecordScheduledBatchSchema,
  ScheduleMedicalEntrySchema,
  VoidMedicalEntrySchema,
  medicalEntryKindsParam,
  medicalEntryFieldErrors,
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
  return medicalEntryFieldErrors(result.error);
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

test("MedicalEntryFormSchema: the next dose's day is keyed by its dotted path", () => {
  const values = {
    kind: "VACCINE",
    itemId: "item",
    completedDate: "2026-09-01",
    source: "IN_HOUSE",
  } as const;
  for (const dueDate of ["", "2026-02-30"]) {
    const errors = fieldErrorsOf({ ...values, scheduleNext: { dueDate } });
    assert.deepEqual(Object.keys(errors), ["scheduleNext.dueDate"], dueDate);
  }
  const parsed = MedicalEntryFormSchema.parse({
    ...values,
    scheduleNext: { dueDate: "2026-09-15" },
  });
  assert.deepEqual(parsed.scheduleNext, { dueDate: "2026-09-15" });
  assert.equal(MedicalEntryFormSchema.parse(values).scheduleNext, null);
});

test("MedicalEntryFormSchema: a row's error is filed on its list", () => {
  const errors = fieldErrorsOf({
    kind: "TEST",
    itemId: "item",
    completedDate: "2026-09-01",
    source: "IN_HOUSE",
    results: [
      { analyteId: "a", result: "NEGATIVE" },
      { analyteId: "b", result: undefined as never },
    ],
  });
  assert.deepEqual(Object.keys(errors), ["results"]);
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

test("medicalEntryKindsParam: a comma list or a repeated param, unknown kinds ignored", () => {
  const kinds = (value: unknown) => medicalEntryKindsParam.parse(value);
  assert.deepEqual(kinds(undefined), []);
  assert.deepEqual(kinds(""), []);
  assert.deepEqual(kinds("VACCINE,TREATMENT"), ["VACCINE", "TREATMENT"]);
  assert.deepEqual(kinds("VACCINE,SURGERY"), ["VACCINE"]);
  // `?kind=VACCINE&kind=TREATMENT,TEST&kind=VACCINE`
  assert.deepEqual(kinds(["VACCINE", "TREATMENT,TEST", "VACCINE"]), [
    "VACCINE",
    "TREATMENT",
    "TEST",
  ]);
});

// Batches. Ids are checked as cuids, so these are shaped like one.
const animals = [
  { animalId: "cmbatchanimal0001" },
  { animalId: "cmbatchanimal0002", rabiesTagNumber: " R-1 " },
];

const batchRecord = {
  mode: "RECORD",
  animals,
  kind: "VACCINE",
  itemId: "item",
  completedDate: "2026-09-01",
  source: "IN_HOUSE",
  durationMonths: 12,
} as const;

const batchErrorsOf = (schema: z.ZodType, values: unknown) => {
  const result = schema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return medicalEntryFieldErrors(result.error);
};

test("MedicalBatchSchema: given care parses with each animal's own tag", () => {
  const result = MedicalBatchSchema.parse(batchRecord);
  assert.equal(result.mode, "RECORD");
  if (result.mode !== "RECORD") throw new Error("unreachable");
  assert.deepEqual(
    result.animals.map((animal) => animal.rabiesTagNumber),
    [null, "R-1"],
  );
  assert.equal(result.kind === "VACCINE" && result.durationMonths, 12);
  // The entry form's rules apply: no vet for care given in house.
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, { ...batchRecord, vetName: "Dr. Lee" })
      .vetName,
  );
});

test("MedicalBatchSchema: given care has a known day, and isn't before intake", () => {
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, { ...batchRecord, completedDate: "" })
      .completedDate,
  );
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, { ...batchRecord, source: "BEFORE_INTAKE" })
      .source,
  );
});

test("MedicalBatchSchema: tests aren't batched, given or scheduled", () => {
  assert.equal(
    MedicalBatchSchema.safeParse({ ...batchRecord, kind: "TEST", results: [] })
      .success,
    false,
  );
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, {
      mode: "SCHEDULE",
      animals,
      kind: "TEST",
      itemId: "item",
      dueDate: "2026-09-01",
    }).kind,
  );
});

test("MedicalBatchSchema: scheduling takes a due day for every animal", () => {
  const result = MedicalBatchSchema.parse({
    mode: "SCHEDULE",
    animals,
    kind: "TREATMENT",
    itemId: "item",
    dueDate: "2026-09-08",
  });
  assert.equal(result.mode === "SCHEDULE" && result.dueDate, "2026-09-08");
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, {
      mode: "SCHEDULE",
      animals,
      kind: "TREATMENT",
      itemId: "item",
      dueDate: "",
    }).dueDate,
  );
});

test("MedicalBatchSchema: one to 50 animals, errors filed on the list", () => {
  assert.ok(batchErrorsOf(MedicalBatchSchema, { ...batchRecord, animals: [] }).animals);
  const many = Array.from({ length: 51 }, (_, i) => ({
    animalId: `cmbatchanimal${String(i).padStart(4, "0")}`,
  }));
  assert.ok(batchErrorsOf(MedicalBatchSchema, { ...batchRecord, animals: many }).animals);
  assert.ok(
    batchErrorsOf(MedicalBatchSchema, {
      ...batchRecord,
      animals: [{ animalId: "cmbatchanimal0001", rabiesTagNumber: "x".repeat(101) }],
    }).animals,
  );
});

test("RecordScheduledBatchSchema: shared details for entries, notes left empty", () => {
  const result = RecordScheduledBatchSchema.parse({
    kind: "TREATMENT",
    entries: [{ entryId: "cmbatchentry0001" }, { entryId: "cmbatchentry0002" }],
    completedDate: "2026-09-01",
    source: "OUTSIDE_VET",
    vetName: "Lakeside",
    doseAmount: 2,
    doseUnit: "ML",
    notes: "  ",
  });
  assert.equal(result.notes, null);
  assert.equal(result.entries.length, 2);
  assert.ok(
    batchErrorsOf(RecordScheduledBatchSchema, {
      kind: "TREATMENT",
      entries: [{ entryId: "cmbatchentry0001" }],
      completedDate: "2026-09-01",
      source: "IN_HOUSE",
      doseAmount: 2,
    }).doseUnit,
  );
});
