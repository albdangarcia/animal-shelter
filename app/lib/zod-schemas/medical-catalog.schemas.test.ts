import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { MedicalItemFormSchema, type MedicalItemFormInput } from "./medical-catalog.schemas";

const base: MedicalItemFormInput = {
  kind: "VACCINE",
  name: "DHPP",
  manufacturer: null,
  speciesIds: [],
  defaultRoute: null,
  defaultDoseAmount: null,
  defaultDoseUnit: null,
  repeatIntervalDays: null,
  isRabies: false,
  analytes: [],
};

// The action hands these to the form as they are, so each message has to be
// keyed to the field the form shows it under.
const fieldErrorsOf = (values: MedicalItemFormInput) => {
  const result = MedicalItemFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors;
};

test("MedicalItemFormSchema: the name is tidied, and a blank manufacturer is null", () => {
  const result = MedicalItemFormSchema.parse({
    ...base,
    name: "  Rabies   1-year ",
    manufacturer: "  ",
  });
  assert.equal(result.name, "Rabies 1-year");
  assert.equal(result.manufacturer, null);
});

test("MedicalItemFormSchema: rabies is refused on anything but a vaccine", () => {
  assert.ok(
    fieldErrorsOf({ ...base, kind: "TREATMENT", isRabies: true }).isRabies,
  );
  assert.equal(MedicalItemFormSchema.safeParse({ ...base, isRabies: true }).success, true);
});

test("MedicalItemFormSchema: a test needs an analyte, named once each", () => {
  assert.ok(fieldErrorsOf({ ...base, kind: "TEST" }).analytes);
  assert.ok(
    fieldErrorsOf({
      ...base,
      kind: "TEST",
      analytes: [{ name: "FeLV antigen" }, { name: "felv  antigen" }],
    }).analytes,
  );
  assert.ok(
    fieldErrorsOf({ ...base, analytes: [{ name: "FeLV antigen" }] }).analytes,
  );
});

test("MedicalItemFormSchema: only a treatment has a dose, and a dose needs a unit", () => {
  assert.ok(fieldErrorsOf({ ...base, defaultDoseAmount: 1, defaultDoseUnit: "ML" }).defaultDoseAmount);
  assert.ok(
    fieldErrorsOf({ ...base, kind: "TREATMENT", defaultDoseAmount: 1 }).defaultDoseUnit,
  );
  assert.ok(
    fieldErrorsOf({
      ...base,
      kind: "TEST",
      analytes: [{ name: "Antigen" }],
      defaultRoute: "ORAL",
    }).defaultRoute,
  );
  assert.equal(
    MedicalItemFormSchema.safeParse({
      ...base,
      kind: "TREATMENT",
      defaultRoute: "ORAL",
      defaultDoseAmount: 2.5,
      defaultDoseUnit: "ML",
    }).success,
    true,
  );
});
