import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageText,
  notScheduledText,
  plannedEntriesText,
  protocolPreviewLines,
  coveredAgesText,
  protocolAgesText,
  protocolStepIssueText,
  protocolStepName,
  protocolStepTimingText,
  protocolSourceText,
  protocolTitle,
  speciesPlural,
  type ProtocolStepTiming,
} from "./medical-protocol-text";
import type { ProtocolPlan, ProtocolPlanStep } from "./medical-protocol-plan";
import { calendarDay } from "./shelter-day";
import {
  ExamType,
  MedicalEntryKind,
  MedicalProtocolStepKind,
  SurgeryProcedure,
} from "@/prisma/generated/enums";

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

test("protocolTitle: a name with protocol after it, unless it already ends in it", () => {
  assert.equal(protocolTitle("Puppy"), "Puppy protocol");
  assert.equal(protocolTitle(" Adult dog "), "Adult dog protocol");
  assert.equal(protocolTitle("Rabbit protocol"), "Rabbit protocol");
  assert.equal(protocolTitle("Kitten Protocol"), "Kitten Protocol");
  assert.equal(protocolTitle("Protocols"), "Protocols protocol");
});

test("notScheduledText: every step left out, with why, as one sentence", () => {
  assert.equal(notScheduledText([]), "");
  assert.equal(
    notScheduledText([{ stepId: "a", label: "spay/neuter", reason: "SEX_UNKNOWN" }]),
    "Not scheduled: spay/neuter (sex unknown).",
  );
  assert.equal(
    notScheduledText([
      { stepId: "a", label: "microchip", reason: "ALREADY_CHIPPED" },
      { stepId: "b", label: "DHPP", reason: "ALREADY_SCHEDULED" },
      { stepId: "c", label: "Rabies 1-year", reason: "TOO_OLD" },
    ]),
    "Not scheduled: microchip (already microchipped), DHPP (already scheduled) and Rabies 1-year (past the age for it).",
  );
});

test("plannedEntriesText: a count of entries, or nothing", () => {
  assert.equal(plannedEntriesText(0), "nothing to schedule");
  assert.equal(plannedEntriesText(1), "1 entry");
  assert.equal(plannedEntriesText(9), "9 entries");
});

test("protocolPreviewLines: a line per step that schedules anything, in step order, its days short", () => {
  const today = calendarDay("2026-10-14");
  const step = (overrides: Partial<ProtocolPlanStep>) =>
    ({
      id: "x",
      kind: MedicalProtocolStepKind.VACCINE,
      item: { id: "dhpp", name: "DHPP", retired: false, speciesIds: [] },
      examType: null,
      sortOrder: 0,
      ...overrides,
    }) as ProtocolPlanStep;
  const steps = [
    step({ id: "spay", kind: MedicalProtocolStepKind.SPAY_NEUTER, item: null, sortOrder: 3 }),
    step({ id: "dhpp", sortOrder: 1 }),
    step({ id: "exam", kind: MedicalProtocolStepKind.EXAM, item: null, examType: ExamType.INTAKE, sortOrder: 0 }),
    step({ id: "chip", kind: MedicalProtocolStepKind.MICROCHIP, item: null, sortOrder: 2 }),
  ];
  const plan: ProtocolPlan = {
    protocol: { id: "p", name: "Puppy" },
    entries: [
      { stepId: "exam", care: { kind: MedicalEntryKind.EXAM, examType: ExamType.INTAKE }, dueDate: today, notes: null },
      { stepId: "dhpp", care: { kind: MedicalEntryKind.VACCINE, itemId: "dhpp" }, dueDate: today, notes: null },
      { stepId: "spay", care: { kind: MedicalEntryKind.SURGERY, procedure: SurgeryProcedure.NEUTER }, dueDate: calendarDay("2026-10-21"), notes: null },
      { stepId: "dhpp", care: { kind: MedicalEntryKind.VACCINE, itemId: "dhpp" }, dueDate: calendarDay("2026-10-28"), notes: null },
      { stepId: "dhpp", care: { kind: MedicalEntryKind.VACCINE, itemId: "dhpp" }, dueDate: calendarDay("2027-01-06"), notes: null },
    ],
    skipped: [{ stepId: "chip", label: "microchip", reason: "ALREADY_CHIPPED" }],
  };

  assert.deepEqual(protocolPreviewLines(plan, steps, today), [
    { stepId: "exam", name: "Intake exam", days: "Oct 14" },
    { stepId: "dhpp", name: "DHPP", days: "Oct 14, Oct 28, Jan 6, 2027" },
    { stepId: "spay", name: "Neuter", days: "Oct 21" },
  ]);
});

test("protocolSourceText: where a protocol entry came from", () => {
  assert.equal(protocolSourceText("Puppy"), "From the Puppy protocol");
  assert.equal(protocolSourceText("Kitten protocol"), "From the Kitten protocol");
});
