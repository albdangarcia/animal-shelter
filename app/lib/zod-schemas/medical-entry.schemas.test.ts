import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DeclineMedicalEntrySchema,
  MedicalBatchSchema,
  MedicalEntryFormSchema,
  RecordScheduledBatchSchema,
  RecordSpayNeuterExemptionSchema,
  ScheduleMedicalEntrySchema,
  SpayNeuterExemptionTermsSchema,
  VoidMedicalEntrySchema,
  medicalEntryKindsParam,
  medicalHistoryKindsParam,
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

test("MedicalEntryFormSchema: care by an outside vet names a clinic, the vet, or both", () => {
  const outside = { ...vaccine, source: "OUTSIDE_VET" } as const;
  for (const vetName of [undefined, "", "   "]) {
    const errors = fieldErrorsOf({ ...outside, vetPartnerId: "", vetName });
    assert.deepEqual(errors.vetName, ["Pick a clinic or give the vet's name."]);
    assert.equal(errors.vetPartnerId, undefined);
  }
  for (const vet of [
    { vetPartnerId: "c00000000000000000000000" },
    { vetName: "Dr. Ruiz" },
    { vetPartnerId: "c00000000000000000000000", vetName: "Dr. Ruiz" },
  ]) {
    assert.equal(MedicalEntryFormSchema.safeParse({ ...outside, ...vet }).success, true);
  }
  // In house and before intake need no vet.
  assert.equal(MedicalEntryFormSchema.safeParse(vaccine).success, true);
  assert.equal(
    MedicalEntryFormSchema.safeParse({ ...vaccine, source: "BEFORE_INTAKE" }).success,
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

const flatErrorsOf = (schema: z.ZodType, values: object) => {
  const result = schema.safeParse(values);
  assert.equal(result.success, false);
  return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
};

test("DeclineMedicalEntrySchema: words, or an exemption that needs words only for Other", () => {
  assert.deepEqual(DeclineMedicalEntrySchema.parse({ reason: " Not needed. " }), {
    reason: "Not needed.",
    exemptionReason: null,
    reviewDate: null,
  });
  assert.deepEqual(flatErrorsOf(DeclineMedicalEntrySchema, { reason: " " }).reason, [
    "A reason for declining this entry is required.",
  ]);
  assert.deepEqual(
    DeclineMedicalEntrySchema.parse({
      reason: "",
      exemptionReason: "TOO_YOUNG_OR_UNDERWEIGHT",
      reviewDate: "2026-11-03",
    }),
    {
      reason: null,
      exemptionReason: "TOO_YOUNG_OR_UNDERWEIGHT",
      reviewDate: "2026-11-03",
    },
  );
  assert.deepEqual(
    flatErrorsOf(DeclineMedicalEntrySchema, { exemptionReason: "OTHER" }).reason,
    ["Say why the animal is exempt."],
  );
  // A review day belongs to an exemption.
  assert.deepEqual(
    flatErrorsOf(DeclineMedicalEntrySchema, { reason: "x", reviewDate: "2026-11-03" })
      .exemptionReason,
    ["Pick the reason for the exemption."],
  );
  assert.deepEqual(
    flatErrorsOf(DeclineMedicalEntrySchema, {
      exemptionReason: "MEDICAL_RISK",
      reviewDate: "2026-02-30",
    }).reviewDate,
    ["The review date isn't a valid date."],
  );
});

test("RecordSpayNeuterExemptionSchema: spay or neuter, a reason, and words for Other", () => {
  assert.deepEqual(
    RecordSpayNeuterExemptionSchema.parse({
      procedure: "NEUTER",
      exemptionReason: "PARTNER_WILL_ALTER",
    }),
    {
      procedure: "NEUTER",
      exemptionReason: "PARTNER_WILL_ALTER",
      reviewDate: null,
      declineReason: null,
    },
  );
  const errors = flatErrorsOf(RecordSpayNeuterExemptionSchema, { procedure: "DENTAL" });
  assert.deepEqual(errors.procedure, ["Pick spay or neuter."]);
  assert.deepEqual(errors.exemptionReason, ["Pick the reason for the exemption."]);
  assert.deepEqual(
    flatErrorsOf(RecordSpayNeuterExemptionSchema, {
      procedure: "SPAY",
      exemptionReason: "OTHER",
      declineReason: "  ",
    }).declineReason,
    ["Say why the animal is exempt."],
  );
});

test("SpayNeuterExemptionTermsSchema: a reason, words for Other, and maybe a review day", () => {
  // What the form declining a scheduled spay holds: no procedure, which the
  // entry already has.
  assert.deepEqual(
    SpayNeuterExemptionTermsSchema.parse({
      procedure: "",
      exemptionReason: "MEDICAL_RISK",
      declineReason: " ",
      reviewDate: "2027-01-15",
    }),
    { exemptionReason: "MEDICAL_RISK", declineReason: null, reviewDate: "2027-01-15" },
  );
  // A blank reason, as the form starts.
  assert.deepEqual(
    flatErrorsOf(SpayNeuterExemptionTermsSchema, { exemptionReason: "" })
      .exemptionReason,
    ["Pick the reason for the exemption."],
  );
  assert.deepEqual(
    flatErrorsOf(SpayNeuterExemptionTermsSchema, {
      exemptionReason: "OTHER",
      declineReason: "",
    }).declineReason,
    ["Say why the animal is exempt."],
  );
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

const surgery: MedicalEntryFormInput = {
  kind: "SURGERY",
  procedure: "SPAY",
  completedDate: "2026-09-01",
  source: "IN_HOUSE",
};

test("MedicalEntryFormSchema: a surgery names its procedure, and no item", () => {
  const parsed = MedicalEntryFormSchema.parse({
    ...surgery,
    surgeon: " Dr. Patel ",
    findings: "",
  });
  assert.equal(parsed.kind, "SURGERY");
  assert.equal(parsed.kind === "SURGERY" && parsed.procedure, "SPAY");
  assert.equal(parsed.kind === "SURGERY" && parsed.surgeon, "Dr. Patel");
  assert.equal(parsed.kind === "SURGERY" && parsed.findings, null);
  assert.equal(parsed.kind === "SURGERY" && parsed.evidence, null);
  assert.equal("itemId" in parsed, false);
  assert.deepEqual(
    fieldErrorsOf({ ...surgery, procedure: undefined } as unknown as MedicalEntryFormInput)
      .procedure,
    ["Pick the procedure."],
  );
});

test("MedicalEntryFormSchema: a surgery's evidence is for before intake, and required there", () => {
  assert.deepEqual(
    fieldErrorsOf({ ...surgery, source: "BEFORE_INTAKE", completedDate: null }).evidence,
    ["Say what shows the surgery was done before intake."],
  );
  for (const source of ["IN_HOUSE", "OUTSIDE_VET"] as const) {
    assert.deepEqual(
      fieldErrorsOf({ ...surgery, source, evidence: "SCAR" }).evidence,
      ["Evidence is only for a surgery done before intake."],
      source,
    );
  }
  const parsed = MedicalEntryFormSchema.parse({
    ...surgery,
    source: "BEFORE_INTAKE",
    completedDate: null,
    evidence: "TATTOO",
  });
  assert.equal(parsed.kind === "SURGERY" && parsed.evidence, "TATTOO");
  assert.equal(parsed.completedDate, null);
});

test("MedicalEntryFormSchema: a microchip's number is checked, and passed on in its stored form", () => {
  const microchip: MedicalEntryFormInput = {
    kind: "MICROCHIP",
    chipNumber: "985 141-000 100 003",
    completedDate: "2026-09-01",
    source: "IN_HOUSE",
    brand: " HomeAgain ",
  };
  const parsed = MedicalEntryFormSchema.parse(microchip);
  assert.equal(parsed.kind === "MICROCHIP" && parsed.chipNumber, "985141000100003");
  assert.equal(parsed.kind === "MICROCHIP" && parsed.brand, "HomeAgain");
  assert.equal("itemId" in parsed, false);
  assert.deepEqual(fieldErrorsOf({ ...microchip, chipNumber: "12345" }).chipNumber, [
    "A chip number is 9 to 15 letters or digits.",
  ]);
  assert.deepEqual(fieldErrorsOf({ ...microchip, chipNumber: "985141.00010003" }).chipNumber, [
    "A chip number has only letters and digits.",
  ]);
  assert.deepEqual(fieldErrorsOf({ ...microchip, chipNumber: " " }).chipNumber, [
    "The chip number is required.",
  ]);
  // Found on a scan before intake, on a day nobody knows.
  const found = MedicalEntryFormSchema.parse({
    ...microchip,
    source: "BEFORE_INTAKE",
    completedDate: null,
  });
  assert.equal(found.completedDate, null);
});

test("ScheduleMedicalEntrySchema: a surgery takes a procedure, other care an item", () => {
  const dueDate = "2026-10-14";
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "SURGERY", procedure: "NEUTER", dueDate }),
    { kind: "SURGERY", procedure: "NEUTER", dueDate, notes: null },
  );
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "TREATMENT", itemId: "item", dueDate }),
    { kind: "TREATMENT", itemId: "item", dueDate, notes: null },
  );
  const errorsOf = (values: object) => {
    const result = ScheduleMedicalEntrySchema.safeParse(values);
    assert.equal(result.success, false);
    return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
  };
  assert.deepEqual(errorsOf({ kind: "SURGERY", dueDate }).procedure, [
    "Pick the procedure.",
  ]);
  assert.deepEqual(errorsOf({ kind: "VACCINE", procedure: "SPAY", dueDate }).itemId, [
    "Pick an item.",
  ]);
  // A microchip needs neither: its number is known once it is implanted.
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "MICROCHIP", itemId: "", dueDate }),
    { kind: "MICROCHIP", dueDate, notes: null },
  );
  // A blank form shows every field's message at once.
  assert.deepEqual(Object.keys(errorsOf({ kind: "", itemId: "", dueDate: "" })).sort(), [
    "dueDate",
    "itemId",
    "kind",
  ]);
  // The form holds an empty choice for the fields its kind hides.
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "MICROCHIP", itemId: "", procedure: "", dueDate }),
    { kind: "MICROCHIP", dueDate, notes: null },
  );
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "VACCINE", itemId: "item", procedure: "", dueDate }),
    { kind: "VACCINE", itemId: "item", dueDate, notes: null },
  );
  assert.deepEqual(
    errorsOf({ kind: "SURGERY", itemId: "", procedure: "", dueDate }).procedure,
    ["Pick the procedure."],
  );
});

const exam: MedicalEntryFormInput = {
  kind: "EXAM",
  examType: "INTAKE",
  overallResult: "NO_CONCERNS",
  completedDate: "2026-09-01",
  source: "IN_HOUSE",
  findings: [
    { bodySystem: "EYES", status: "NORMAL", notes: "" },
    { bodySystem: "HEART", status: "ABNORMAL", notes: " Grade II/VI murmur. " },
  ],
};

test("MedicalEntryFormSchema: an exam names its type and result, with findings and no item", () => {
  const parsed = MedicalEntryFormSchema.parse({ ...exam, reproductiveStatus: "" });
  assert.equal(parsed.kind, "EXAM");
  if (parsed.kind !== "EXAM") throw new Error("unreachable");
  assert.equal(parsed.examType, "INTAKE");
  assert.equal(parsed.overallResult, "NO_CONCERNS");
  // An empty choice is no reproductive status.
  assert.equal(parsed.reproductiveStatus, null);
  assert.deepEqual(parsed.findings, [
    { bodySystem: "EYES", status: "NORMAL", notes: null },
    { bodySystem: "HEART", status: "ABNORMAL", notes: "Grade II/VI murmur." },
  ]);
  assert.equal("itemId" in parsed, false);
  const intact = MedicalEntryFormSchema.parse({ ...exam, reproductiveStatus: "INTACT" });
  assert.equal(intact.kind === "EXAM" && intact.reproductiveStatus, "INTACT");

  const errors = fieldErrorsOf({
    ...exam,
    examType: undefined,
    overallResult: undefined,
  } as unknown as MedicalEntryFormInput);
  assert.deepEqual(errors.examType, ["Pick the exam type."]);
  assert.deepEqual(errors.overallResult, ["Pick the overall result."]);
});

test("MedicalEntryFormSchema: an exam's findings name each system once, with a note on an abnormal one", () => {
  assert.deepEqual(
    fieldErrorsOf({
      ...exam,
      findings: [{ bodySystem: "HEART", status: "ABNORMAL", notes: " " }],
    }).findings,
    ["Heart is abnormal: say what was found."],
  );
  assert.deepEqual(
    fieldErrorsOf({
      ...exam,
      findings: [
        { bodySystem: "EYES", status: "NORMAL" },
        { bodySystem: "EYES", status: "NOT_EXAMINED" },
      ],
    }).findings,
    ["Eyes has more than one finding."],
  );
  // A row's own error is filed on the list too.
  assert.deepEqual(
    Object.keys(
      fieldErrorsOf({
        ...exam,
        findings: [{ bodySystem: "EYES", status: "SEEN" }],
      } as unknown as MedicalEntryFormInput),
    ),
    ["findings"],
  );
  // Which systems the exam must cover depends on the exam, so a list short of
  // the code's twelve is the service's to judge.
  assert.equal(MedicalEntryFormSchema.safeParse(exam).success, true);
});

test("MedicalEntryFormSchema: an exam is in house or by an outside vet, never before intake", () => {
  assert.deepEqual(
    fieldErrorsOf({ ...exam, source: "BEFORE_INTAKE", completedDate: null }).source,
    ["An exam is recorded in house or by an outside vet."],
  );
  assert.equal(
    MedicalEntryFormSchema.safeParse({ ...exam, source: "OUTSIDE_VET", vetName: "Dr. Ruiz" })
      .success,
    true,
  );
});

test("MedicalEntryFormSchema: an exam's vitals are optional, blank is none, and each keeps the Vitals page's bounds", () => {
  const vitalsOf = (values: MedicalEntryFormInput) => {
    const parsed = MedicalEntryFormSchema.parse(values);
    if (parsed.kind !== "EXAM") throw new Error("unreachable");
    return parsed.vitals;
  };
  assert.equal(vitalsOf(exam), null);
  assert.equal(
    vitalsOf({
      ...exam,
      vitals: { weightGrams: null, temperatureC: null, bodyConditionScore: null },
    }),
    null,
  );
  assert.deepEqual(vitalsOf({ ...exam, vitals: { temperatureC: 38.6 } }), {
    weightGrams: null,
    temperatureC: 38.6,
    bodyConditionScore: null,
  });

  const errors = fieldErrorsOf({
    ...exam,
    vitals: { weightGrams: 0, temperatureC: 50, bodyConditionScore: 10 },
  });
  assert.deepEqual(errors["vitals.weightGrams"], ["Weight must be a positive number."]);
  assert.deepEqual(errors["vitals.temperatureC"], ["Temperature must be at most 45°C."]);
  assert.deepEqual(errors["vitals.bodyConditionScore"], [
    "Body condition score must be between 1 and 9.",
  ]);
});

test("MedicalEntryFormSchema: an exam records the spay or neuter it found only when it reads altered", () => {
  const altered = { ...exam, reproductiveStatus: "ALTERED" } as MedicalEntryFormInput;
  const parsed = MedicalEntryFormSchema.parse({
    ...altered,
    foundAltered: { procedure: "NEUTER" },
  });
  assert.deepEqual(parsed.kind === "EXAM" && parsed.foundAltered, { procedure: "NEUTER" });
  const none = MedicalEntryFormSchema.parse(altered);
  assert.equal(none.kind === "EXAM" && none.foundAltered, null);

  assert.deepEqual(
    fieldErrorsOf({
      ...exam,
      reproductiveStatus: "INTACT",
      foundAltered: { procedure: "SPAY" },
    } as MedicalEntryFormInput).foundAltered,
    ["A spay or neuter is recorded with an exam only when the exam found the animal altered."],
  );
  assert.deepEqual(
    fieldErrorsOf({
      ...altered,
      foundAltered: { procedure: "DENTAL" },
    } as unknown as MedicalEntryFormInput)["foundAltered.procedure"],
    ["Pick spay or neuter."],
  );
});

test("ScheduleMedicalEntrySchema: an exam takes its type", () => {
  const dueDate = "2026-10-14";
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({
      kind: "EXAM",
      examType: "RECHECK",
      itemId: "",
      procedure: "",
      dueDate,
    }),
    { kind: "EXAM", examType: "RECHECK", dueDate, notes: null },
  );
  const result = ScheduleMedicalEntrySchema.safeParse({
    kind: "EXAM",
    examType: "",
    dueDate,
  });
  assert.equal(result.success, false);
  assert.deepEqual(
    (z.flattenError(result.error!).fieldErrors as Record<string, string[]>).examType,
    ["Pick the exam type."],
  );
  // Other care takes no exam type.
  assert.deepEqual(
    ScheduleMedicalEntrySchema.parse({ kind: "VACCINE", itemId: "item", examType: "", dueDate }),
    { kind: "VACCINE", itemId: "item", dueDate, notes: null },
  );
});

test("medicalEntryKindsParam: a comma list or a repeated param, unknown kinds ignored", () => {
  const kinds = (value: unknown) => medicalEntryKindsParam.parse(value);
  assert.deepEqual(kinds(undefined), []);
  assert.deepEqual(kinds(""), []);
  assert.deepEqual(kinds("VACCINE,TREATMENT"), ["VACCINE", "TREATMENT"]);
  assert.deepEqual(kinds("VACCINE,SURGERY"), ["VACCINE", "SURGERY"]);
  assert.deepEqual(kinds("EXAM"), ["EXAM"]);
  assert.deepEqual(kinds("VACCINE,GROOMING"), ["VACCINE"]);
  // `?kind=VACCINE&kind=TREATMENT,TEST&kind=VACCINE`
  assert.deepEqual(kinds(["VACCINE", "TREATMENT,TEST", "VACCINE"]), [
    "VACCINE",
    "TREATMENT",
    "TEST",
  ]);
});

test("medicalHistoryKindsParam: entry kinds plus conditions, care episodes and medications", () => {
  const kinds = (value: unknown) => medicalHistoryKindsParam.parse(value);
  assert.deepEqual(kinds(undefined), []);
  assert.deepEqual(kinds("CONDITION,CARE_EPISODE"), ["CONDITION", "CARE_EPISODE"]);
  assert.deepEqual(kinds(["TEST,CONDITION", "GROOMING", "TEST"]), ["TEST", "CONDITION"]);
  assert.deepEqual(kinds("MEDICATION,VACCINE"), ["MEDICATION", "VACCINE"]);
  // The Due page's filter lists entries only.
  assert.deepEqual(medicalEntryKindsParam.parse("CONDITION,EXAM,MEDICATION"), ["EXAM"]);
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

test("MedicalBatchSchema: care given by an outside vet names a clinic or the vet", () => {
  const outside = { ...batchRecord, source: "OUTSIDE_VET" } as const;
  assert.deepEqual(batchErrorsOf(MedicalBatchSchema, outside).vetName, [
    "Pick a clinic or give the vet's name.",
  ]);
  assert.equal(MedicalBatchSchema.safeParse({ ...outside, vetName: "Dr. Lee" }).success, true);
  assert.equal(
    MedicalBatchSchema.safeParse({ ...outside, vetPartnerId: "c00000000000000000000000" })
      .success,
    true,
  );
});

test("RecordScheduledBatchSchema: care given by an outside vet names a clinic or the vet", () => {
  const outside = {
    kind: "TREATMENT",
    entries: [{ entryId: "cmbatchentry0001" }],
    completedDate: "2026-09-01",
    source: "OUTSIDE_VET",
  } as const;
  assert.deepEqual(batchErrorsOf(RecordScheduledBatchSchema, outside).vetName, [
    "Pick a clinic or give the vet's name.",
  ]);
  assert.equal(
    RecordScheduledBatchSchema.safeParse({ ...outside, vetName: "Lakeside" }).success,
    true,
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


test("outcome-owned kinds filter History but cannot be recorded, scheduled or batched as ordinary care", () => {
  const batch = { ...vaccine, mode: "RECORD", animals: [{ animalId: "cmvc07m5h0094dtulmaxfa9gc" }] };
  assert.equal(MedicalBatchSchema.safeParse(batch).success, true);
  for (const kind of ["EUTHANASIA", "DEATH"]) {
    assert.deepEqual(medicalHistoryKindsParam.parse(kind), [kind]);
    assert.equal(MedicalEntryFormSchema.safeParse({ ...vaccine, kind }).success, false);
    assert.equal(ScheduleMedicalEntrySchema.safeParse({ kind, dueDate: "2026-10-14" }).success, false);
    assert.equal(MedicalBatchSchema.safeParse({ ...batch, kind }).success, false);
  }
});
