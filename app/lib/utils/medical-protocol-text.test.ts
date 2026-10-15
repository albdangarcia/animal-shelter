import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageText,
  coveredAgesText,
  protocolAgesText,
  protocolStepIssueText,
  protocolStepName,
  protocolStepTimingText,
  speciesPlural,
  type ProtocolStepTiming,
} from "./medical-protocol-text";

test("speciesPlural: lower case, with an s unless it has one", () => {
  assert.equal(speciesPlural("Dog"), "dogs");
  assert.equal(speciesPlural("Guinea Pig"), "guinea pigs");
  assert.equal(speciesPlural("Hamsters"), "hamsters");
});

test("coveredAgesText: the last age covered is the day before the maximum", () => {
  assert.equal(coveredAgesText(null, 140), "from birth to 139 days");
  assert.equal(coveredAgesText(0, 140), "from birth to 139 days");
  assert.equal(coveredAgesText(56, 140), "from 56 to 139 days");
});

test("coveredAgesText: open ends", () => {
  assert.equal(coveredAgesText(140, null), "from 140 days");
  assert.equal(coveredAgesText(1, null), "from 1 day");
  assert.equal(coveredAgesText(null, null), "at every age");
  assert.equal(coveredAgesText(0, null), "at every age");
});

test("coveredAgesText: a range of one age", () => {
  assert.equal(coveredAgesText(null, 1), "aged 0 days");
  assert.equal(coveredAgesText(1, 2), "aged 1 day");
  assert.equal(coveredAgesText(null, 2), "from birth to 1 day");
});

test("ageText: whole weeks read in weeks", () => {
  assert.equal(ageText(42), "6 weeks");
  assert.equal(ageText(7), "1 week");
  assert.equal(ageText(140), "20 weeks");
  assert.equal(ageText(45), "45 days");
  assert.equal(ageText(1), "1 day");
  assert.equal(ageText(0), "0 days");
});

test("protocolAgesText: who a protocol is for, stopping short of its maximum", () => {
  assert.equal(protocolAgesText("Dog", null, 140), "Dogs under 140 days");
  assert.equal(protocolAgesText("Dog", 0, 140), "Dogs under 140 days");
  assert.equal(protocolAgesText("Dog", 140, null), "Dogs from 140 days");
  assert.equal(protocolAgesText("Cat", 56, 140), "Cats from 56 days, under 140 days");
  assert.equal(protocolAgesText("Guinea Pig", null, null), "Guinea pigs of every age");
  assert.equal(protocolAgesText("Rabbit", 1, null), "Rabbits from 1 day");
});

const timing = (overrides: Partial<ProtocolStepTiming> = {}): ProtocolStepTiming => ({
  offsetDays: 0,
  notBeforeAgeDays: null,
  repeatIntervalDays: null,
  repeatCount: null,
  untilAgeDays: null,
  ...overrides,
});

test("protocolStepTimingText: a one-off step", () => {
  assert.equal(protocolStepTimingText(timing()), "at intake");
  assert.equal(protocolStepTimingText(timing({ offsetDays: 1 })), "1 day after intake");
  assert.equal(
    protocolStepTimingText(timing({ offsetDays: 7, notBeforeAgeDays: 56 })),
    "7 days after intake, not before 8 weeks",
  );
  // An age to stop at with no repeats: one dose, only for the young.
  assert.equal(
    protocolStepTimingText(timing({ untilAgeDays: 140 })),
    "at intake, only under 20 weeks",
  );
});

test("protocolStepTimingText: a repeating step, by count, by age, or both", () => {
  assert.equal(
    protocolStepTimingText(
      timing({ notBeforeAgeDays: 42, repeatIntervalDays: 14, untilAgeDays: 140 }),
    ),
    "from intake, not before 6 weeks, every 14 days until 20 weeks",
  );
  assert.equal(
    protocolStepTimingText(timing({ repeatIntervalDays: 14, repeatCount: 2 })),
    "from intake, every 14 days, 2 more times",
  );
  assert.equal(
    protocolStepTimingText(timing({ offsetDays: 3, repeatIntervalDays: 21, repeatCount: 1 })),
    "from 3 days after intake, every 21 days, 1 more time",
  );
  assert.equal(
    protocolStepTimingText(
      timing({ repeatIntervalDays: 1, repeatCount: 11, untilAgeDays: 100 }),
    ),
    "from intake, every 1 day until 100 days, at most 11 more times",
  );
});

test("protocolStepName: the item, or what the step is, capitalised", () => {
  const item = { id: "i", name: "DHPP", retired: false, speciesIds: [] };
  assert.equal(protocolStepName({ kind: "VACCINE", item, examType: null }), "DHPP");
  assert.equal(protocolStepName({ kind: "SPAY_NEUTER", item: null, examType: null }), "Spay/neuter");
  assert.equal(protocolStepName({ kind: "MICROCHIP", item: null, examType: null }), "Microchip");
  assert.equal(protocolStepName({ kind: "EXAM", item: null, examType: "INTAKE" }), "Intake exam");
});

test("protocolStepIssueText: a step whose item no longer fits says why", () => {
  const item = (retired: boolean, speciesIds: string[]) => ({
    item: { id: "i", name: "DHPP", retired, speciesIds },
  });
  assert.equal(protocolStepIssueText(item(false, []), "dog"), null);
  assert.equal(protocolStepIssueText(item(false, ["dog"]), "dog"), null);
  assert.equal(protocolStepIssueText({ item: null }, "dog"), null);
  assert.equal(
    protocolStepIssueText(item(true, ["dog"]), "dog"),
    "won't be scheduled: retired from the catalog",
  );
  assert.equal(
    protocolStepIssueText(item(false, ["cat"]), "dog"),
    "won't be scheduled: not for this species",
  );
});
