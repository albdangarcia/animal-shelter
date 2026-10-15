import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MedicalProtocolFormSchema,
  type MedicalProtocolFormInput,
} from "./medical-protocol.schemas";

const ITEM = "ckq1a2b3c4d5e6f7g8h9i0j1k";
const SPECIES = "ckq1a2b3c4d5e6f7g8h9i0j2k";

type StepInput = MedicalProtocolFormInput["steps"][number];

const step = (overrides: Partial<StepInput> = {}): StepInput => ({
  kind: "VACCINE",
  itemId: ITEM,
  examType: null,
  offsetDays: 0,
  notBeforeAgeDays: null,
  repeatIntervalDays: null,
  repeatCount: null,
  untilAgeDays: null,
  notes: null,
  ...overrides,
});

const base = (overrides: Partial<MedicalProtocolFormInput> = {}): MedicalProtocolFormInput => ({
  name: "Puppy",
  speciesId: SPECIES,
  minAgeDays: null,
  maxAgeDays: 140,
  steps: [step()],
  ...overrides,
});

// The action hands step messages to the form keyed `steps.<i>.<field>`, so
// each issue has to carry the path of the field it is shown under.
const issuePaths = (values: MedicalProtocolFormInput) => {
  const result = MedicalProtocolFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return result.error.issues.map((issue) => issue.path.join("."));
};

test("MedicalProtocolFormSchema: the name is tidied, and blank notes are null", () => {
  const result = MedicalProtocolFormSchema.parse(
    base({ name: "  Puppy   protocol ", steps: [step({ notes: "  " })] }),
  );
  assert.equal(result.name, "Puppy protocol");
  assert.equal(result.steps[0].notes, null);
});

test("MedicalProtocolFormSchema: name, ages and steps", () => {
  assert.deepEqual(issuePaths(base({ name: " " })), ["name"]);
  assert.deepEqual(issuePaths(base({ name: "x".repeat(81) })), ["name"]);
  assert.equal(MedicalProtocolFormSchema.safeParse(base({ name: "x".repeat(80) })).success, true);
  assert.deepEqual(issuePaths(base({ minAgeDays: 140, maxAgeDays: 140 })), ["maxAgeDays"]);
  assert.deepEqual(issuePaths(base({ minAgeDays: -1 })), ["minAgeDays"]);
  assert.deepEqual(issuePaths(base({ maxAgeDays: 0 })), ["maxAgeDays"]);
  assert.deepEqual(issuePaths(base({ minAgeDays: 1.5 })), ["minAgeDays"]);
  assert.deepEqual(issuePaths(base({ steps: [] })), ["steps"]);
  const blankSpecies = MedicalProtocolFormSchema.safeParse(base({ speciesId: "" }));
  assert.deepEqual(
    blankSpecies.error?.issues.map((issue) => [issue.path.join("."), issue.message]),
    [["speciesId", "Pick a species."]],
  );
  // A cleared number field holds null.
  const noOffset = MedicalProtocolFormSchema.safeParse(
    base({ steps: [step({ offsetDays: null as unknown as number })] }),
  );
  assert.deepEqual(
    noOffset.error?.issues.map((issue) => [issue.path.join("."), issue.message]),
    [["steps.0.offsetDays", "Give the days after intake."]],
  );
  assert.equal(
    MedicalProtocolFormSchema.safeParse(base({ minAgeDays: null, maxAgeDays: null })).success,
    true,
  );
});

test("MedicalProtocolFormSchema: each kind's fields", () => {
  assert.deepEqual(issuePaths(base({ steps: [step(), step({ itemId: null })] })), [
    "steps.1.itemId",
  ]);
  assert.deepEqual(
    issuePaths(base({ steps: [step({ kind: "EXAM", itemId: null })] })),
    ["steps.0.examType"],
  );
  assert.deepEqual(
    issuePaths(base({ steps: [step({ kind: "EXAM", examType: "INTAKE" })] })),
    ["steps.0.itemId"],
  );
  assert.deepEqual(
    issuePaths(base({ steps: [step({ examType: "VET" })] })),
    ["steps.0.examType"],
  );
  for (const kind of ["SPAY_NEUTER", "MICROCHIP"] as const) {
    assert.equal(
      MedicalProtocolFormSchema.safeParse(base({ steps: [step({ kind, itemId: null })] })).success,
      true,
    );
  }
});

test("MedicalProtocolFormSchema: offsets and ages a step waits for", () => {
  assert.deepEqual(issuePaths(base({ steps: [step({ offsetDays: 366 })] })), [
    "steps.0.offsetDays",
  ]);
  assert.deepEqual(issuePaths(base({ steps: [step({ offsetDays: -1 })] })), [
    "steps.0.offsetDays",
  ]);
  assert.deepEqual(issuePaths(base({ steps: [step({ notBeforeAgeDays: 1826 })] })), [
    "steps.0.notBeforeAgeDays",
  ]);
  assert.equal(
    MedicalProtocolFormSchema.safeParse(
      base({ steps: [step({ offsetDays: 365, notBeforeAgeDays: 1825 })] }),
    ).success,
    true,
  );
});

test("MedicalProtocolFormSchema: repeats", () => {
  // An interval needs a bound.
  assert.deepEqual(issuePaths(base({ steps: [step({ repeatIntervalDays: 14 })] })), [
    "steps.0.repeatCount",
  ]);
  // A count needs an interval.
  assert.deepEqual(issuePaths(base({ steps: [step({ repeatCount: 2 })] })), [
    "steps.0.repeatIntervalDays",
  ]);
  assert.deepEqual(
    issuePaths(base({ steps: [step({ repeatIntervalDays: 14, repeatCount: 12 })] })),
    ["steps.0.repeatCount"],
  );
  assert.deepEqual(
    issuePaths(
      base({ steps: [step({ kind: "SPAY_NEUTER", itemId: null, repeatIntervalDays: 14, repeatCount: 1 })] }),
    ),
    ["steps.0.repeatIntervalDays"],
  );
  assert.deepEqual(
    issuePaths(
      base({ steps: [step({ notBeforeAgeDays: 56, untilAgeDays: 56 })] }),
    ),
    ["steps.0.untilAgeDays"],
  );
  for (const repeats of [
    { repeatIntervalDays: 14, repeatCount: 11 },
    { repeatIntervalDays: 14, untilAgeDays: 140 },
    { repeatIntervalDays: 14, repeatCount: 2, untilAgeDays: 140 },
    // A one-off dose for the young.
    { untilAgeDays: 140 },
  ]) {
    assert.equal(
      MedicalProtocolFormSchema.safeParse(base({ steps: [step(repeats)] })).success,
      true,
      JSON.stringify(repeats),
    );
  }
});
