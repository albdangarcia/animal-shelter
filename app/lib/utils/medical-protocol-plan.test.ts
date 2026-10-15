import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageInDays,
  matchProtocol,
  planProtocol,
  planStepDays,
  protocolStepLabel,
  type ProtocolPlanFacts,
  type ProtocolPlanProtocol,
  type ProtocolPlanStep,
} from "./medical-protocol-plan";
import { calendarDay } from "./shelter-day";
import {
  ExamType,
  MedicalProtocolStepKind,
  Sex,
} from "@/prisma/generated/enums";

const day = calendarDay;
const TODAY = day("2026-10-14");

const protocol = (
  overrides: Partial<ProtocolPlanProtocol> = {},
): ProtocolPlanProtocol => ({
  id: "puppy",
  name: "Puppy",
  speciesId: "dog",
  minAgeDays: null,
  maxAgeDays: 140,
  retired: false,
  steps: [],
  ...overrides,
});

let stepCounter = 0;
const step = (overrides: Partial<ProtocolPlanStep> = {}): ProtocolPlanStep => ({
  id: `step-${++stepCounter}`,
  kind: MedicalProtocolStepKind.VACCINE,
  item: { id: "dhpp", name: "DHPP", retired: false, speciesIds: [] },
  examType: null,
  offsetDays: 0,
  notBeforeAgeDays: null,
  repeatIntervalDays: null,
  repeatCount: null,
  untilAgeDays: null,
  notes: null,
  sortOrder: stepCounter,
  ...overrides,
});

const exam = (overrides: Partial<ProtocolPlanStep> = {}) =>
  step({
    kind: MedicalProtocolStepKind.EXAM,
    item: null,
    examType: ExamType.INTAKE,
    ...overrides,
  });
const spayNeuter = (overrides: Partial<ProtocolPlanStep> = {}) =>
  step({ kind: MedicalProtocolStepKind.SPAY_NEUTER, item: null, ...overrides });
const microchip = (overrides: Partial<ProtocolPlanStep> = {}) =>
  step({ kind: MedicalProtocolStepKind.MICROCHIP, item: null, ...overrides });

// A nine-week-old female puppy arriving today.
const facts = (overrides: Partial<ProtocolPlanFacts> = {}): ProtocolPlanFacts => ({
  speciesId: "dog",
  sex: Sex.FEMALE,
  birthDate: day("2026-08-12"),
  intakeDate: TODAY,
  altered: false,
  exempt: false,
  chipped: false,
  openScheduled: {
    itemIds: [],
    examTypes: [],
    spayNeuter: false,
    microchip: false,
  },
  ...overrides,
});

const days = (
  overrides: Partial<ProtocolPlanStep>,
  plannedFrom: { birthDate: string; intakeDate: string },
  today = TODAY,
) =>
  planStepDays(
    step(overrides),
    { birthDate: day(plannedFrom.birthDate), intakeDate: day(plannedFrom.intakeDate) },
    today,
  );

// --- Age -------------------------------------------------------------------

test("ageInDays: born on the day is age 0", () => {
  assert.equal(ageInDays(day("2026-10-14"), day("2026-10-14")), 0);
  assert.equal(ageInDays(day("2026-10-13"), day("2026-10-14")), 1);
});

test("ageInDays: a birth day after the day counts as age 0", () => {
  assert.equal(ageInDays(day("2026-10-20"), day("2026-10-14")), 0);
});

test("ageInDays: counts Feb 29 in a leap year", () => {
  assert.equal(ageInDays(day("2028-02-28"), day("2028-03-01")), 2);
  assert.equal(ageInDays(day("2027-02-28"), day("2027-03-01")), 1);
  assert.equal(ageInDays(day("2027-10-14"), day("2028-10-14")), 366);
});

// --- Matching --------------------------------------------------------------

const born = (age: number) => ({
  speciesId: "dog",
  birthDate: day("2026-10-14"),
  intakeDate: day(
    new Date(Date.UTC(2026, 9, 14 + age)).toISOString().slice(0, 10),
  ),
});

test("matchProtocol: the minimum age is covered, the maximum isn't", () => {
  const adult = protocol({ id: "adult", name: "Dog", minAgeDays: 140, maxAgeDays: null });
  const puppy = protocol({ id: "puppy", minAgeDays: null, maxAgeDays: 140 });
  const protocols = [puppy, adult];
  assert.equal(matchProtocol(protocols, born(0))?.id, "puppy");
  assert.equal(matchProtocol(protocols, born(139))?.id, "puppy");
  assert.equal(matchProtocol(protocols, born(140))?.id, "adult");
  assert.equal(matchProtocol(protocols, born(4000))?.id, "adult");
});

test("matchProtocol: both ends open covers every age", () => {
  const any = protocol({ minAgeDays: null, maxAgeDays: null });
  assert.equal(matchProtocol([any], born(0)), any);
  assert.equal(matchProtocol([any], born(9000)), any);
});

test("matchProtocol: only the animal's species", () => {
  const cat = protocol({ speciesId: "cat", maxAgeDays: null });
  assert.equal(matchProtocol([cat], born(10)), null);
});

test("matchProtocol: retired protocols are ignored", () => {
  const retired = protocol({ id: "old", retired: true, maxAgeDays: null });
  const live = protocol({ id: "new", minAgeDays: 60, maxAgeDays: null });
  assert.equal(matchProtocol([retired, live], born(10)), null);
  assert.equal(matchProtocol([retired, live], born(60))?.id, "new");
});

test("matchProtocol: an age between two ranges gets none", () => {
  const young = protocol({ id: "young", maxAgeDays: 56 });
  const older = protocol({ id: "older", minAgeDays: 84, maxAgeDays: null });
  assert.equal(matchProtocol([young, older], born(56)), null);
  assert.equal(matchProtocol([young, older], born(83)), null);
  assert.equal(matchProtocol([young, older], born(84))?.id, "older");
});

test("matchProtocol: a birth after the intake day is age 0", () => {
  const newborn = protocol({ minAgeDays: 0, maxAgeDays: 1 });
  assert.equal(
    matchProtocol([newborn], {
      speciesId: "dog",
      birthDate: day("2026-09-23"),
      intakeDate: day("2026-09-03"),
    }),
    newborn,
  );
});

// --- Due days --------------------------------------------------------------

test("planStepDays: the first dose is the offset from intake", () => {
  assert.deepEqual(
    days({ offsetDays: 7 }, { birthDate: "2026-01-01", intakeDate: "2026-10-14" }),
    { days: ["2026-10-21"] },
  );
});

test("planStepDays: not before an age, when that comes later than the offset", () => {
  // Born Aug 12: 56 days old on Oct 7, 112 days old on Dec 2.
  const plannedFrom = { birthDate: "2026-08-12", intakeDate: "2026-10-14" };
  assert.deepEqual(days({ offsetDays: 7, notBeforeAgeDays: 112 }, plannedFrom), {
    days: ["2026-12-02"],
  });
  // An age already reached leaves the offset to decide.
  assert.deepEqual(days({ offsetDays: 7, notBeforeAgeDays: 56 }, plannedFrom), {
    days: ["2026-10-21"],
  });
});

test("planStepDays: a backdated intake starts today, never in the past", () => {
  const plannedFrom = { birthDate: "2026-01-01", intakeDate: "2026-09-01" };
  assert.deepEqual(days({ offsetDays: 7 }, plannedFrom), { days: ["2026-10-14"] });
  // Repeats follow from that first dose.
  assert.deepEqual(
    days({ offsetDays: 0, repeatIntervalDays: 14, repeatCount: 2 }, plannedFrom),
    { days: ["2026-10-14", "2026-10-28", "2026-11-11"] },
  );
  // An age reached in the past doesn't pull the dose back either.
  assert.deepEqual(days({ offsetDays: 0, notBeforeAgeDays: 30 }, plannedFrom), {
    days: ["2026-10-14"],
  });
});

test("planStepDays: repeats by count", () => {
  assert.deepEqual(
    days(
      { repeatIntervalDays: 21, repeatCount: 1 },
      { birthDate: "2025-01-01", intakeDate: "2026-10-14" },
    ),
    { days: ["2026-10-14", "2026-11-04"] },
  );
});

test("planStepDays: repeats while under an age, and a dose on the day it is reached is left out", () => {
  // Born Aug 12, 2026: 140 days old on Dec 30.
  const plannedFrom = { birthDate: "2026-08-12", intakeDate: "2026-10-14" };
  assert.deepEqual(
    days({ notBeforeAgeDays: 42, repeatIntervalDays: 14, untilAgeDays: 140 }, plannedFrom),
    {
      days: [
        "2026-10-14",
        "2026-10-28",
        "2026-11-11",
        "2026-11-25",
        "2026-12-09",
        "2026-12-23",
      ],
    },
  );
  // A dose 77 days on falls on Dec 30, the day the puppy turns 140 days.
  assert.deepEqual(
    days({ repeatIntervalDays: 77, untilAgeDays: 140 }, plannedFrom),
    { days: ["2026-10-14"] },
  );
  assert.deepEqual(
    days({ repeatIntervalDays: 77, untilAgeDays: 141 }, plannedFrom),
    { days: ["2026-10-14", "2026-12-30"] },
  );
});

test("planStepDays: with both bounds, the first reached ends the doses", () => {
  const plannedFrom = { birthDate: "2026-08-12", intakeDate: "2026-10-14" };
  // The count ends it first.
  assert.deepEqual(
    days({ repeatIntervalDays: 14, repeatCount: 2, untilAgeDays: 140 }, plannedFrom),
    { days: ["2026-10-14", "2026-10-28", "2026-11-11"] },
  );
  // The age ends it first.
  assert.deepEqual(
    days({ repeatIntervalDays: 30, repeatCount: 10, untilAgeDays: 140 }, plannedFrom),
    { days: ["2026-10-14", "2026-11-13", "2026-12-13"] },
  );
});

test("planStepDays: never more than 12 doses", () => {
  const plannedFrom = { birthDate: "2020-01-01", intakeDate: "2026-10-14" };
  assert.equal(
    days({ repeatIntervalDays: 1, repeatCount: 11 }, plannedFrom).days.length,
    12,
  );
  assert.equal(
    days({ repeatIntervalDays: 7, untilAgeDays: 9000 }, plannedFrom).days.length,
    12,
  );
  // A count past the cap is held to it.
  assert.equal(
    days({ repeatIntervalDays: 1, repeatCount: 40 }, plannedFrom).days.length,
    12,
  );
});

test("planStepDays: doses past the five-year ceiling aren't planned", () => {
  // Five years from Oct 14, 2026 is Oct 14, 2031.
  const plannedFrom = { birthDate: "2020-01-01", intakeDate: "2026-10-14" };
  assert.deepEqual(
    days({ repeatIntervalDays: 1825, repeatCount: 3 }, plannedFrom),
    { days: ["2026-10-14", "2031-10-13"] },
  );
  // A first dose past it plans nothing, and says why.
  assert.deepEqual(
    days({ offsetDays: 365, notBeforeAgeDays: 1825 }, {
      birthDate: "2027-06-01",
      intakeDate: "2026-10-14",
    }),
    { days: [], reason: "BEYOND_CEILING" },
  );
});

test("planStepDays: an animal already past the age plans nothing, and says why", () => {
  const plannedFrom = { birthDate: "2026-04-01", intakeDate: "2026-10-14" };
  assert.deepEqual(
    days({ repeatIntervalDays: 14, untilAgeDays: 140 }, plannedFrom),
    { days: [], reason: "TOO_OLD" },
  );
  // A one-off dose for the young only.
  assert.deepEqual(days({ untilAgeDays: 140 }, plannedFrom), {
    days: [],
    reason: "TOO_OLD",
  });
  assert.deepEqual(
    days({ untilAgeDays: 140 }, { birthDate: "2026-08-12", intakeDate: "2026-10-14" }),
    { days: ["2026-10-14"] },
  );
});

// --- Kinds and skips -------------------------------------------------------

const plan = (steps: ProtocolPlanStep[], animal = facts()) =>
  planProtocol(protocol({ steps }), animal, TODAY);

test("planProtocol: a spay for a female and a neuter for a male", () => {
  const spay = plan([spayNeuter({ offsetDays: 7 })]);
  assert.deepEqual(spay.entries.map((entry) => entry.care), [
    { kind: "SURGERY", procedure: "SPAY" },
  ]);
  const neuter = plan([spayNeuter({ offsetDays: 7 })], facts({ sex: Sex.MALE }));
  assert.deepEqual(neuter.entries.map((entry) => entry.care), [
    { kind: "SURGERY", procedure: "NEUTER" },
  ]);
  assert.deepEqual(neuter.skipped, []);
});

test("planProtocol: spay/neuter is skipped for an unknown sex and for an animal already altered", () => {
  const unknown = spayNeuter();
  assert.deepEqual(plan([unknown], facts({ sex: Sex.UNKNOWN })).skipped, [
    { stepId: unknown.id, label: "spay/neuter", reason: "SEX_UNKNOWN" },
  ]);
  const altered = spayNeuter();
  const result = plan([altered], facts({ altered: true }));
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [
    { stepId: altered.id, label: "spay/neuter", reason: "ALREADY_ALTERED" },
  ]);
});

test("planProtocol: spay/neuter is skipped while an exemption holds, and altered is named first", () => {
  const exempt = spayNeuter();
  assert.deepEqual(plan([exempt], facts({ exempt: true })).skipped, [
    { stepId: exempt.id, label: "spay/neuter", reason: "EXEMPT" },
  ]);
  assert.deepEqual(
    plan([exempt], facts({ exempt: true, altered: true })).skipped.map(
      (skip) => skip.reason,
    ),
    ["ALREADY_ALTERED"],
  );
  // An exemption is about spay/neuter only.
  assert.equal(plan([exam(), microchip()], facts({ exempt: true })).entries.length, 2);
});

test("planProtocol: a microchip is skipped for an animal already chipped", () => {
  const chip = microchip();
  assert.deepEqual(plan([chip]).entries.map((entry) => entry.care), [
    { kind: "MICROCHIP" },
  ]);
  assert.deepEqual(plan([chip], facts({ chipped: true })).skipped, [
    { stepId: chip.id, label: "microchip", reason: "ALREADY_CHIPPED" },
  ]);
});

test("planProtocol: an exam schedules its type", () => {
  const intake = exam();
  assert.deepEqual(plan([intake]).entries, [
    {
      stepId: intake.id,
      care: { kind: "EXAM", examType: "INTAKE" },
      dueDate: TODAY,
      notes: null,
    },
  ]);
});

test("planProtocol: care already open and scheduled is skipped, by item, exam type, spay/neuter and microchip", () => {
  const dhpp = step();
  const rabies = step({ item: { id: "rabies", name: "Rabies 1-year", retired: false, speciesIds: [] } });
  const intake = exam();
  const recheck = exam({ examType: ExamType.RECHECK });
  const alter = spayNeuter();
  const chip = microchip();
  const result = plan(
    [dhpp, rabies, intake, recheck, alter, chip],
    facts({
      openScheduled: {
        itemIds: ["dhpp"],
        examTypes: [ExamType.INTAKE],
        spayNeuter: true,
        microchip: true,
      },
    }),
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.stepId),
    [rabies.id, recheck.id],
  );
  assert.deepEqual(result.skipped, [
    { stepId: dhpp.id, label: "DHPP", reason: "ALREADY_SCHEDULED" },
    { stepId: intake.id, label: "Intake exam", reason: "ALREADY_SCHEDULED" },
    { stepId: alter.id, label: "spay/neuter", reason: "ALREADY_SCHEDULED" },
    { stepId: chip.id, label: "microchip", reason: "ALREADY_SCHEDULED" },
  ]);
});

test("planProtocol: an item retired, or narrowed to other species, since the protocol was saved is skipped", () => {
  const retired = step({
    item: { id: "old", name: "Old Bordetella", retired: true, speciesIds: ["dog"] },
  });
  const narrowed = step({
    kind: MedicalProtocolStepKind.TREATMENT,
    item: { id: "sel", name: "Selamectin", retired: false, speciesIds: ["cat"] },
  });
  const forDogs = step({
    kind: MedicalProtocolStepKind.TEST,
    item: { id: "hw", name: "Heartworm antigen", retired: false, speciesIds: ["cat", "dog"] },
  });
  const result = plan([retired, narrowed, forDogs]);
  assert.deepEqual(result.skipped, [
    { stepId: retired.id, label: "Old Bordetella", reason: "ITEM_RETIRED" },
    { stepId: narrowed.id, label: "Selamectin", reason: "ITEM_NOT_FOR_SPECIES" },
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.care), [
    { kind: "TEST", itemId: "hw" },
  ]);
});

test("planProtocol: a retired item is named retired even when it's also already scheduled", () => {
  const retired = step({
    item: { id: "dhpp", name: "DHPP", retired: true, speciesIds: ["cat"] },
  });
  assert.deepEqual(
    plan(
      [retired],
      facts({ openScheduled: { itemIds: ["dhpp"], examTypes: [], spayNeuter: false, microchip: false } }),
    ).skipped.map((skip) => skip.reason),
    ["ITEM_RETIRED"],
  );
});

test("planProtocol: a step past its age is skipped as too old", () => {
  const young = step({ repeatIntervalDays: 14, untilAgeDays: 60 });
  assert.deepEqual(plan([young]).skipped, [
    { stepId: young.id, label: "DHPP", reason: "TOO_OLD" },
  ]);
});

test("planProtocol: entries by due day, then step order; skips in step order; notes carried", () => {
  const steps = [
    // Listed out of order: the plan follows sortOrder.
    spayNeuter({ offsetDays: 7, notBeforeAgeDays: 56, sortOrder: 8, notes: "Fasted from midnight." }),
    microchip({ sortOrder: 7 }),
    step({ sortOrder: 2, notBeforeAgeDays: 42, repeatIntervalDays: 14, repeatCount: 1 }),
    exam({ sortOrder: 1, notes: "Weigh on arrival." }),
    step({
      sortOrder: 3,
      item: { id: "bord", name: "Bordetella", retired: true, speciesIds: [] },
    }),
    spayNeuter({ sortOrder: 9 }),
  ];
  const result = planProtocol(
    protocol({ steps }),
    facts({ chipped: true }),
    TODAY,
  );
  assert.deepEqual(
    result.entries.map((entry) => [entry.dueDate, entry.care.kind, entry.notes]),
    [
      ["2026-10-14", "EXAM", "Weigh on arrival."],
      ["2026-10-14", "VACCINE", null],
      ["2026-10-14", "SURGERY", null],
      ["2026-10-21", "SURGERY", "Fasted from midnight."],
      ["2026-10-28", "VACCINE", null],
    ],
  );
  assert.deepEqual(
    result.skipped.map((skip) => [skip.label, skip.reason]),
    [
      ["Bordetella", "ITEM_RETIRED"],
      ["microchip", "ALREADY_CHIPPED"],
    ],
  );
  assert.deepEqual(result.protocol, { id: "puppy", name: "Puppy" });
});

test("protocolStepLabel: names a step by its item, its exam type, or what it is", () => {
  assert.equal(protocolStepLabel(step()), "DHPP");
  assert.equal(protocolStepLabel(exam({ examType: ExamType.VET })), "Vet exam");
  assert.equal(protocolStepLabel(spayNeuter()), "spay/neuter");
  assert.equal(protocolStepLabel(microchip()), "microchip");
});
