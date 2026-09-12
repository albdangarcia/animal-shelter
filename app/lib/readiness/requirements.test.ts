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

test("only Daily Rounds carries a staleness threshold", () => {
  const requirements = readinessRequirementsFor("Dog");
  const dailyRounds = requirements.find((r) => r.templateKey === "DAILY_ROUNDS");
  assert.equal(dailyRounds?.maxAgeDays, 1);

  const oneTime = requirements.filter((r) => r.templateKey !== "DAILY_ROUNDS");
  assert.ok(oneTime.length > 0);
  for (const requirement of oneTime) {
    assert.equal(requirement.maxAgeDays, undefined);
  }
});
