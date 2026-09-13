import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeReadiness,
  type ComputeReadinessInputs,
  type ReadinessAssessment,
  type ReadinessCharacteristicClaim,
} from "./compute-readiness";

const NOW = new Date(2026, 8, 12, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
const IN_CARE_SINCE = daysBefore(40);

const baseInputs: ComputeReadinessInputs = {
  requirements: [],
  assessments: [],
  claims: [],
  isSpayedNeutered: true,
  hasPhoto: true,
  healthStatus: "HEALTHY",
  inCareSince: IN_CARE_SINCE,
};

const assessment = (
  overrides: Partial<ReadinessAssessment> = {},
): ReadinessAssessment => ({
  id: "a1",
  templateKey: "INTAKE_MEDICAL",
  templateName: "Intake Medical",
  observedAt: NOW,
  signal: "NO_CONCERNS",
  ...overrides,
});

const claim = (
  overrides: Partial<ReadinessCharacteristicClaim> = {},
): ReadinessCharacteristicClaim => ({
  characteristicId: "c1",
  characteristicName: "Good with cats",
  assignedAt: daysBefore(30),
  contradictedAt: null,
  sourceDeletedAt: null,
  supportLostAt: null,
  ...overrides,
});

test("an animal with nothing wrong has no blockers", () => {
  assert.deepEqual(computeReadiness(baseInputs), []);
});

test("a requirement with no matching assessment is missing", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [{ templateKey: "INTAKE_MEDICAL", templateName: "Intake Medical" }],
  });
  assert.deepEqual(blockers, [
    {
      kind: "MISSING_ASSESSMENT",
      templateKey: "INTAKE_MEDICAL",
      templateName: "Intake Medical",
      since: IN_CARE_SINCE,
    },
  ]);
});

test("a satisfied one-time requirement, however old, is not missing", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [{ templateKey: "INTAKE_MEDICAL", templateName: "Intake Medical" }],
    assessments: [assessment({ observedAt: new Date(2020, 0, 1) })],
  });
  assert.deepEqual(blockers, []);
});

test("multiple unmet requirements each produce their own blocker", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [
      { templateKey: "INTAKE_MEDICAL", templateName: "Intake Medical" },
      { templateKey: "INTAKE_BEHAVIORAL", templateName: "Intake Behavioral" },
    ],
  });
  assert.equal(blockers.length, 2);
  assert.ok(blockers.every((b) => b.kind === "MISSING_ASSESSMENT"));
});

test("a live escalated finding blocks", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [assessment({ signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" })],
  });
  assert.deepEqual(blockers, [
    { kind: "ESCALATED_FINDING", assessmentId: "a1", templateName: "Cat Test", observedAt: NOW, since: NOW },
  ]);
});

test("an escalation superseded by a later, calmer check of the same template does not block", () => {
  const earlier = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "old", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: earlier }),
      assessment({ id: "new", signal: "NO_CONCERNS", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: NOW }),
    ],
  });
  assert.deepEqual(blockers, []);
});

test("an escalation is not superseded by a later check of a different template", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "cat", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: new Date(2026, 0, 1) }),
      assessment({ id: "dog", signal: "NO_CONCERNS", templateKey: "DOG_INTRO", templateName: "Dog-to-Dog Introduction", observedAt: NOW }),
    ],
  });
  assert.deepEqual(blockers, [
    {
      kind: "ESCALATED_FINDING",
      assessmentId: "cat",
      templateName: "Cat Test",
      observedAt: new Date(2026, 0, 1),
      since: new Date(2026, 0, 1),
    },
  ]);
});

test("escalations are ordered deterministically by template key", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "dog", signal: "ESCALATE", templateKey: "DOG_INTRO", templateName: "Dog-to-Dog Introduction" }),
      assessment({ id: "cat", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" }),
    ],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "ESCALATED_FINDING" ? b.assessmentId : null)),
    ["cat", "dog"],
  );
});

test("a contradicted characteristic blocks", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ contradictedAt: daysBefore(9) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "CONTRADICTED",
      since: daysBefore(9),
    },
  ]);
});

test("a trait citing a deleted assessment blocks with SOURCE_DELETED", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "SOURCE_DELETED",
      since: daysBefore(6),
    },
  ]);
});

test("a trait whose source no longer supports it blocks with NO_LONGER_SUPPORTED", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ supportLostAt: daysBefore(2) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "NO_LONGER_SUPPORTED",
      since: daysBefore(2),
    },
  ]);
});

test("a claim made over older evidence is undermined only from when it was made", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ assignedAt: daysBefore(3), contradictedAt: daysBefore(21) })],
  });
  assert.deepEqual(
    blockers.map((b) => b.since),
    [daysBefore(3)],
  );
});

test("SOURCE_DELETED wins over NO_LONGER_SUPPORTED — a deleted source's answers aren't a separate problem", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6), supportLostAt: daysBefore(8) })],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "UNSUPPORTED_CHARACTERISTIC" ? b.issue : null)),
    ["SOURCE_DELETED"],
  );
});

test("a deleted source and a separate live contradiction are two distinct problems", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6), contradictedAt: daysBefore(9) })],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "UNSUPPORTED_CHARACTERISTIC" ? b.issue : null)).sort(),
    ["CONTRADICTED", "SOURCE_DELETED"],
  );
});

test("an unassigned, unproblematic claim is never passed in — no blocker from an empty claim", () => {
  const blockers = computeReadiness({ ...baseInputs, claims: [claim()] });
  assert.deepEqual(blockers, []);
});

test("not spayed or neutered blocks from the start of the stay", () => {
  const blockers = computeReadiness({ ...baseInputs, isSpayedNeutered: false });
  assert.deepEqual(blockers, [{ kind: "NOT_SPAYED_NEUTERED", since: IN_CARE_SINCE }]);
});

test("no photo blocks from the start of the stay", () => {
  const blockers = computeReadiness({ ...baseInputs, hasPhoto: false });
  assert.deepEqual(blockers, [{ kind: "NO_PHOTO", since: IN_CARE_SINCE }]);
});

test("an acute health status blocks, with no onset date to report", () => {
  const blockers = computeReadiness({ ...baseInputs, healthStatus: "HOSPITALISED" });
  assert.deepEqual(blockers, [
    { kind: "ACUTE_HEALTH", healthStatus: "HOSPITALISED", since: null },
  ]);
});

test("a null health status does not block", () => {
  const blockers = computeReadiness({ ...baseInputs, healthStatus: null });
  assert.deepEqual(blockers, []);
});

test("HEALTHY and AWAITING_SPAY_NEUTER are not acute", () => {
  for (const healthStatus of ["HEALTHY", "AWAITING_SPAY_NEUTER"] as const) {
    const blockers = computeReadiness({ ...baseInputs, healthStatus });
    assert.deepEqual(blockers, []);
  }
});

test("every acute health status blocks", () => {
  const acute = [
    "AWAITING_TRIAGE",
    "AWAITING_VET_EXAM",
    "UNDER_VET_CARE",
    "HOSPITALISED",
    "AWAITING_OTHER_SURGERY",
    "RECOVERING_FROM_SURGERY",
  ] as const;
  for (const healthStatus of acute) {
    const blockers = computeReadiness({ ...baseInputs, healthStatus });
    assert.deepEqual(blockers, [{ kind: "ACUTE_HEALTH", healthStatus, since: null }]);
  }
});

test("every blocker kind can appear together on one animal", () => {
  const blockers = computeReadiness({
    requirements: [{ templateKey: "INTAKE_MEDICAL", templateName: "Intake Medical" }],
    assessments: [assessment({ signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" })],
    claims: [claim({ contradictedAt: daysBefore(1) })],
    isSpayedNeutered: false,
    hasPhoto: false,
    healthStatus: "UNDER_VET_CARE",
    inCareSince: IN_CARE_SINCE,
  });
  const kinds = blockers.map((b) => b.kind).sort();
  assert.deepEqual(kinds, [
    "ACUTE_HEALTH",
    "ESCALATED_FINDING",
    "MISSING_ASSESSMENT",
    "NOT_SPAYED_NEUTERED",
    "NO_PHOTO",
    "UNSUPPORTED_CHARACTERISTIC",
  ]);
});
