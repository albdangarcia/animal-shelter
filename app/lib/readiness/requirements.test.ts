import { test } from "node:test";
import assert from "node:assert/strict";
import { readinessRequirementsFor } from "./requirements";

test("species-agnostic templates apply to every species", () => {
  const dogKeys = readinessRequirementsFor("Dog").map((r) => r.templateKey);
  const catKeys = readinessRequirementsFor("Cat").map((r) => r.templateKey);
  assert.ok(dogKeys.includes("INTAKE_MEDICAL"));
  assert.ok(dogKeys.includes("INTAKE_BEHAVIORAL"));
  assert.ok(catKeys.includes("INTAKE_MEDICAL"));
  assert.ok(catKeys.includes("INTAKE_BEHAVIORAL"));
});

test("dog-scoped templates apply only to dogs", () => {
  const dogKeys = readinessRequirementsFor("Dog").map((r) => r.templateKey);
  const catKeys = readinessRequirementsFor("Cat").map((r) => r.templateKey);
  assert.ok(dogKeys.includes("CAT_TEST"));
  assert.ok(dogKeys.includes("DOG_INTRO"));
  assert.ok(!catKeys.includes("CAT_TEST"));
  assert.ok(!catKeys.includes("DOG_INTRO"));
});

test("a template with no stage is not a requirement", () => {
  const keys = readinessRequirementsFor("Dog").map((r) => r.templateKey);
  assert.ok(!keys.includes("HANDLING"));
});

test("an in-care stage template is not a readiness requirement", () => {
  const keys = readinessRequirementsFor("Dog").map((r) => r.templateKey);
  assert.ok(!keys.includes("DAILY_ROUNDS"));
});
