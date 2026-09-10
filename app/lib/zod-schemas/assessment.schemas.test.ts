import { test } from "node:test";
import assert from "node:assert/strict";
import { AssessmentSignal, FieldType } from "@/prisma/generated/enums";
import {
  getActiveTemplate,
  type AssessmentTemplateDef,
} from "../assessments/templates";
import { buildAssessmentSchema } from "./assessment.schemas";

const catTest = getActiveTemplate("CAT_TEST")!;
const schema = buildAssessmentSchema(catTest);

const baseFields = () => ({
  visual_response: { value: "Ignores" },
  proximity_response: { value: "Calm" },
  recovery: { value: "" },
  recommendation: { value: "Cat-safe" },
  notes: { value: "" },
});

const base = () => ({
  templateKey: "CAT_TEST",
  observedAt: new Date(Date.now() - 60_000),
  signal: AssessmentSignal.NO_CONCERNS,
  summary: "",
  fields: baseFields(),
});

test("a well-formed submission parses", () => {
  assert.equal(schema.safeParse(base()).success, true);
});

test("a missing required answer is rejected on that field path", () => {
  const input = base();
  input.fields.recommendation.value = "";
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.error.issues.some(
        (i) => i.path.join(".") === "fields.recommendation.value",
      ),
  );
});

test("an answer outside the field's options is rejected", () => {
  const input = base();
  input.fields.visual_response.value = "Wandered off";
  assert.equal(schema.safeParse(input).success, false);
});

test("a future observation date is rejected", () => {
  const input = base();
  input.observedAt = new Date(Date.now() + 86_400_000);
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.error.issues.some((i) => i.path.join(".") === "observedAt"),
  );
});

test("the wrong template key is rejected", () => {
  const input = { ...base(), templateKey: "DOG_INTRO" };
  assert.equal(schema.safeParse(input).success, false);
});

test("INTAKE_MEDICAL no longer carries weight or body condition", () => {
  const medical = getActiveTemplate("INTAKE_MEDICAL")!;
  const keys = medical.fields.map((f) => f.key);
  assert.deepEqual(keys, ["dental", "parasites", "heart_lungs", "notes"]);
});

test("INTAKE_MEDICAL requires the core exam questions (dental + heart & lungs)", () => {
  const medical = getActiveTemplate("INTAKE_MEDICAL")!;
  const required = medical.fields
    .filter((f) => f.isRequired)
    .map((f) => f.key)
    .sort();
  assert.deepEqual(required, ["dental", "heart_lungs"]);
});

test("a fully blank INTAKE_MEDICAL is rejected", () => {
  const medical = getActiveTemplate("INTAKE_MEDICAL")!;
  const result = buildAssessmentSchema(medical).safeParse({
    templateKey: "INTAKE_MEDICAL",
    observedAt: new Date(Date.now() - 60_000),
    signal: AssessmentSignal.NO_CONCERNS,
    summary: "",
    fields: {
      dental: { value: "" },
      parasites: { value: "" },
      heart_lungs: { value: "" },
      notes: { value: "" },
    },
  });
  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.error.issues.some(
        (i) => i.path.join(".") === "fields.dental.value",
      ),
  );
});

// --- the "no findings, no summary" floor, exercised against a template whose
// every field is optional so the floor is the only thing that can fail --------

const allOptional: AssessmentTemplateDef = {
  key: "OPT_PROBE",
  version: 1,
  name: "Optional probe",
  description: "d",
  fields: [
    {
      key: "a",
      label: "A",
      fieldType: FieldType.SINGLE_SELECT,
      options: ["x", "y"],
    },
    { key: "notes", label: "Notes", fieldType: FieldType.LONG_TEXT },
  ],
};
const optSchema = buildAssessmentSchema(allOptional);
const optInput = (over: Record<string, unknown> = {}) => ({
  templateKey: "OPT_PROBE",
  observedAt: new Date(Date.now() - 60_000),
  signal: AssessmentSignal.NO_CONCERNS,
  summary: "",
  fields: { a: { value: "" }, notes: { value: "" } },
  ...over,
});

test("all answers blank and no summary is rejected on the summary path", () => {
  const result = optSchema.safeParse(optInput());
  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.error.issues.some((i) => i.path.join(".") === "summary"),
  );
});

test("a summary alone records a light-touch observation", () => {
  const result = optSchema.safeParse(optInput({ summary: "Nothing remarkable." }));
  assert.equal(result.success, true);
});

test("one non-blank answer is enough with no summary", () => {
  const result = optSchema.safeParse(
    optInput({ fields: { a: { value: "x" }, notes: { value: "" } } }),
  );
  assert.equal(result.success, true);
});

test("a whitespace-only summary does not satisfy the floor", () => {
  const result = optSchema.safeParse(optInput({ summary: "   " }));
  assert.equal(result.success, false);
});

test("NUMBER fields accept a number and reject a string", () => {
  // No shipped template carries a NUMBER field, but the builder must still
  // handle one — exercise it against a synthetic def.
  const withNumber: AssessmentTemplateDef = {
    key: "NUMERIC_PROBE",
    version: 1,
    name: "Numeric probe",
    description: "d",
    fields: [
      { key: "count", label: "Count", fieldType: FieldType.NUMBER },
      { key: "notes", label: "Notes", fieldType: FieldType.LONG_TEXT },
    ],
  };
  const schemaWithNumber = buildAssessmentSchema(withNumber);
  const input = (countValue: unknown) => ({
    templateKey: "NUMERIC_PROBE",
    observedAt: new Date(Date.now() - 60_000),
    signal: AssessmentSignal.NO_CONCERNS,
    // A summary so the "no findings, no summary" floor doesn't mask what
    // this test is about.
    summary: "recorded",
    fields: { count: { value: countValue }, notes: { value: "" } },
  });

  assert.equal(schemaWithNumber.safeParse(input(4200)).success, true);
  assert.equal(schemaWithNumber.safeParse(input(null)).success, true);
  assert.equal(schemaWithNumber.safeParse(input("heavy")).success, false);
});
