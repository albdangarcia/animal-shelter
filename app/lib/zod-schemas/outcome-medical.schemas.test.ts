import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeathMedicalSchema,
  EuthanasiaMedicalSchema,
  OutcomeMedicalCreateSchema,
  OutcomeMedicalCorrectionSchema,
} from "./outcome-medical.schemas";
import { MEDICAL_REASON_MAX_LENGTH, OUTCOME_MEDICAL_TEXT_MAX_LENGTH } from "@/app/lib/constants/medical";
import { fieldErrorsByPath } from "@/app/lib/utils/form-result-utils";

const person = "cmvc07m5h0094dtulmaxfa9gc";
const euthanasia = {
  kind: "EUTHANASIA",
  source: "IN_HOUSE",
  reasonCategory: "MEDICAL",
  authorizedById: person,
  performedById: person,
  drug: "Recorded agent",
  dose: "Recorded amount mL",
  route: "Recorded route",
} as const;
const death = {
  kind: "DEATH",
  circumstances: "FOUND_DEAD",
  causeKnowledge: "UNKNOWN",
  necropsyRequested: null,
} as const;

test("new end-of-life outcomes require complete medical facts, including when a client claims legacy", () => {
  for (const outcomeType of ["EUTHANIZED", "DECEASED"]) {
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType }).success, false);
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType, legacy: true }).success, false);
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType, medical: null }).success, false);
  }
  assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType: "EUTHANIZED", medical: euthanasia }).success, true);
  assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType: "DECEASED", medical: death }).success, true);
});

test("ordinary outcomes accept no medical payload, and mismatched kinds are refused", () => {
  for (const schema of [OutcomeMedicalCreateSchema, OutcomeMedicalCorrectionSchema]) {
    for (const outcomeType of ["ADOPTION", "TRANSFER_OUT", "RETURN_TO_OWNER", "OTHER"]) {
      assert.deepEqual(schema.parse({ outcomeType, ownerId: "hidden", destinationPartnerId: "hidden" }), { outcomeType });
      assert.equal(schema.safeParse({ outcomeType, medical: euthanasia }).success, false);
      assert.equal(schema.safeParse({ outcomeType, medical: death }).success, false);
    }
    assert.equal(schema.safeParse({ outcomeType: "EUTHANIZED", medical: death }).success, false);
    assert.equal(schema.safeParse({ outcomeType: "DECEASED", medical: euthanasia }).success, false);
  }
});

test("correction omission keeps the clinical record, whereas a supplied payload must be complete", () => {
  for (const outcomeType of ["EUTHANIZED", "DECEASED"]) {
    assert.deepEqual(OutcomeMedicalCorrectionSchema.parse({ outcomeType }), { outcomeType });
    assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType, medical: null }).success, false);
    assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType, medical: {} }).success, false);
  }
  assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType: "EUTHANIZED", medical: { ...euthanasia, drug: undefined } }).success, false);
  assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType: "DECEASED", medical: death }).success, true);
});

test("euthanasia trims its facts, clears optional blanks and permits the authorizer to be the performer", () => {
  const parsed = EuthanasiaMedicalSchema.parse({ ...euthanasia, authorizedById: ` ${person} `, performedById: ` ${person} `, drug: " Recorded agent ", dose: " Recorded amount mL ", route: " Recorded route ", reasonNotes: "  ", witness: "  ", bodyDisposition: "  " });
  assert.equal(parsed.authorizedById, person);
  assert.equal(parsed.performedById, person);
  assert.equal(parsed.drug, euthanasia.drug);
  assert.equal(parsed.dose, euthanasia.dose);
  assert.equal(parsed.route, euthanasia.route);
  for (const field of ["reasonNotes", "performedByName", "vetPartnerId", "vetName", "witness", "bodyDisposition"] as const) {
    assert.equal(parsed[field], null);
  }
  assert.deepEqual(EuthanasiaMedicalSchema.parse(parsed), parsed);
});

test("euthanasia requires each core fact, never defaulting an actor", () => {
  for (const field of ["reasonCategory", "authorizedById", "performedById", "drug", "dose", "route", "source"]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: undefined }).success, false, field);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: "   " }).success, false, field);
  }
  for (const field of ["authorizedById", "performedById", "vetPartnerId"]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: "invalid ID" }).success, false, field);
  }
});

test("euthanasia requires exactly one performer and names alone are for outside care", () => {
  const outside = { ...euthanasia, source: "OUTSIDE_VET", performedById: "", performedByName: " Dr Example " };
  assert.equal(EuthanasiaMedicalSchema.parse(outside).performedByName, "Dr Example");
  assert.equal(EuthanasiaMedicalSchema.parse(outside).performedById, null);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, performedById: person }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, performedByName: "  " }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, source: "IN_HOUSE" }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET" }).success, true);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, performedById: null, source: "OUTSIDE_VET", vetPartnerId: person }).success, false);
});

test("an invalid performer choice marks both alternatives so the active control can show its error", () => {
  for (const performer of [
    { performedById: null, performedByName: "   " },
    { performedById: person, performedByName: "Dr Example" },
  ]) {
    const result = EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET", ...performer });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.deepEqual(result.error.issues.map((issue) => issue.path), [["performedById"], ["performedByName"]]);
    assert.equal(result.error.issues[0].message, result.error.issues[1].message);
  }
});

test("euthanasia source excludes before-intake and in-house care excludes clinic or vet fields", () => {
  for (const source of ["BEFORE_INTAKE", null, ""]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source }).success, false);
  }
  for (const fields of [{ vetPartnerId: person }, { vetName: "Dr Example" }]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, ...fields }).success, false);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET", ...fields }).success, true);
  }
});

test("Other reasons and circumstances require their own explanatory notes", () => {
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "OTHER", reasonNotes: "  " }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "OTHER", reasonNotes: " Recorded reason " }).success, true);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "OTHER", circumstanceNotes: "  " }).success, false);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "OTHER", circumstanceNotes: " Recorded circumstances " }).success, true);
});

test("short descriptive fields accept the limit after trimming and refuse an overlong value", () => {
  for (const field of ["drug", "dose", "route", "witness", "bodyDisposition", "vetName", "performedByName"]) {
    const base = { ...euthanasia, source: "OUTSIDE_VET", ...(field === "performedByName" ? { performedById: null } : {}) };
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...base, [field]: ` ${"x".repeat(OUTCOME_MEDICAL_TEXT_MAX_LENGTH)} ` }).success, true, field);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...base, [field]: "x".repeat(OUTCOME_MEDICAL_TEXT_MAX_LENGTH + 1) }).success, false, field);
  }
  assert.equal(DeathMedicalSchema.safeParse({ ...death, bodyDisposition: "x".repeat(200) }).success, true);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, bodyDisposition: "x".repeat(201) }).success, false);
});

test("clinical prose uses the reason length limit", () => {
  for (const [schema, base, field] of [
    [EuthanasiaMedicalSchema, euthanasia, "reasonNotes"],
    [DeathMedicalSchema, death, "circumstanceNotes"],
    [DeathMedicalSchema, { ...death, causeKnowledge: "KNOWN" }, "cause"],
  ] as const) {
    assert.equal(schema.safeParse({ ...base, [field]: ` ${"x".repeat(MEDICAL_REASON_MAX_LENGTH)} ` }).success, true, field);
    assert.equal(schema.safeParse({ ...base, [field]: "x".repeat(MEDICAL_REASON_MAX_LENGTH + 1) }).success, false, field);
  }
});

test("death requires an explicit known-or-unknown choice, and a known cause needs text", () => {
  for (const causeKnowledge of [undefined, null, "", "MAYBE"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, causeKnowledge }).success, false);
  }
  for (const cause of [undefined, null, "  "]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, causeKnowledge: "KNOWN", cause }).success, false);
  }
  assert.equal(DeathMedicalSchema.parse({ ...death, causeKnowledge: "KNOWN", cause: " Recorded cause " }).cause, "Recorded cause");
});

test("Unknown clears stale cause text and preserves unknown necropsy rather than inventing No", () => {
  const parsed = DeathMedicalSchema.parse({ ...death, cause: "Previously typed cause", bodyDisposition: " " });
  assert.equal(parsed.cause, null);
  assert.equal(parsed.necropsyRequested, null);
  assert.equal(parsed.bodyDisposition, null);
  assert.equal(parsed.source, null);
  assert.deepEqual(DeathMedicalSchema.parse(parsed), parsed);
  for (const necropsyRequested of [true, false, null]) {
    assert.equal(DeathMedicalSchema.parse({ ...death, necropsyRequested }).necropsyRequested, necropsyRequested);
  }
  for (const necropsyRequested of [undefined, "false", "", 0]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, necropsyRequested }).success, false);
  }
  assert.equal(DeathMedicalSchema.parse({ ...death, bodyDisposition: " Pending " }).bodyDisposition, "Pending");
});

test("clinical payloads refuse unrelated fields, fake care attribution and unsupported enum values", () => {
  for (const field of ["drug", "performedById", "administeredById", "vetPartnerId", "dueDate", "notes"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, [field]: person }).success, false, field);
  }
  for (const source of ["IN_HOUSE", "OUTSIDE_VET", "BEFORE_INTAKE"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, source }).success, false);
  }
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, circumstances: "FOUND_DEAD" }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "UNKNOWN" }).success, false);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "UNKNOWN" }).success, false);
});

test("nested errors retain dotted form paths for applyFieldErrors", () => {
  const parsed = OutcomeMedicalCreateSchema.safeParse({ outcomeType: "EUTHANIZED", medical: { ...euthanasia, reasonCategory: "OTHER", drug: " " } });
  assert.equal(parsed.success, false);
  if (parsed.success) throw new Error("Expected validation errors");
  const errors = fieldErrorsByPath<Record<string, unknown>>(parsed.error.issues);
  assert.ok(errors["medical.drug"]);
  assert.ok(errors["medical.reasonNotes"]);
});
