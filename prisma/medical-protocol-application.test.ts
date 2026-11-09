// Applying a medical protocol at intake, against a real Postgres: what it
// writes (entries naming their step, their events, one activity row), what it
// leaves out and why, and that a protocol changed afterwards, or while it
// runs, never moves care already scheduled.
// `medical-protocol-application.ts` is the whole of the apply, bar the intake
// that calls it.
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ExamType,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  MedicalProtocolStepKind,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { createMedicalItem, retireMedicalItem } from "@/app/lib/services/medical-catalog";
import {
  createMedicalProtocol,
  retireMedicalProtocol,
  updateMedicalProtocol,
  type MedicalProtocolInput,
  type MedicalProtocolStepInput,
} from "@/app/lib/services/medical-protocol";
import {
  MedicalEntryRefusal,
  recordMedicalEntry,
  recordSpayNeuterExemption,
  scheduleMedicalEntry,
} from "@/app/lib/services/medical-entry";
import { applyIntakeProtocol } from "@/app/lib/services/medical-protocol-application";
import {
  findDueMedicalEntries,
  findEventNames,
} from "@/app/lib/data/animals/medical-entry";
import { findMedicalDue } from "@/app/lib/data/medical-due";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const day = calendarDay;
const TODAY = day("2026-10-10");

let counter = 0;
const uniqueName = (label: string) => `${label} ${++counter} ${runId}`;

let dogId: string;
let birdId: string;
let colorId: string;
let staffId: string;
let dhppId: string;
let fecalId: string;
let pyrantelId: string;
let dhppName: string;

const newItem = async (kind: MedicalItemKind, label: string, speciesIds: string[] = []) => {
  const name = uniqueName(label);
  const { id } = await prisma.$transaction((tx) =>
    createMedicalItem(tx, {
      kind,
      name,
      speciesIds,
      analytes: kind === MedicalItemKind.TEST ? [{ name: "Result" }] : [],
    }),
  );
  return { id, name };
};

before(async () => {
  const species = async (label: string) =>
    (
      await prisma.species.create({
        data: { name: uniqueName(label) },
        select: { id: true },
      })
    ).id;
  dogId = await species("Protocol dog");
  birdId = await species("Protocol bird");
  colorId = (
    await prisma.color.create({ data: { name: uniqueName("Color") }, select: { id: true } })
  ).id;
  staffId = (
    await prisma.person.create({ data: { name: uniqueName("Staff") }, select: { id: true } })
  ).id;
  ({ id: dhppId, name: dhppName } = await newItem(MedicalItemKind.VACCINE, "DHPP", [dogId]));
  ({ id: fecalId } = await newItem(MedicalItemKind.TEST, "Fecal"));
  ({ id: pyrantelId } = await newItem(MedicalItemKind.TREATMENT, "Pyrantel"));
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId: { in: [dogId, birdId] } } });
  const protocols = { name: { endsWith: runId } };
  await prisma.medicalProtocolStep.deleteMany({ where: { protocol: protocols } });
  await prisma.medicalProtocol.deleteMany({ where: protocols });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [dogId, birdId] } } });
  await prisma.$disconnect();
});

// Every protocol here is for the test's own dog species, so each test that
// writes one retires it before the next, keeping one live protocol per age.
const liveProtocolIds = new Set<string>();
afterEach(async () => {
  await prisma.medicalProtocol.updateMany({
    where: { id: { in: [...liveProtocolIds] } },
    data: { retiredAt: new Date() },
  });
  liveProtocolIds.clear();
});

/** The puppy protocol's steps, in its order. */
const puppySteps = (): MedicalProtocolStepInput[] => [
  {
    kind: MedicalProtocolStepKind.EXAM,
    examType: ExamType.INTAKE,
    offsetDays: 0,
    notes: "Weigh on arrival.",
  },
  {
    kind: MedicalProtocolStepKind.VACCINE,
    itemId: dhppId,
    offsetDays: 0,
    notBeforeAgeDays: 42,
    repeatIntervalDays: 14,
    untilAgeDays: 140,
  },
  { kind: MedicalProtocolStepKind.TEST, itemId: fecalId, offsetDays: 3 },
  {
    kind: MedicalProtocolStepKind.TREATMENT,
    itemId: pyrantelId,
    offsetDays: 0,
    repeatIntervalDays: 14,
    repeatCount: 2,
  },
  { kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0 },
  { kind: MedicalProtocolStepKind.SPAY_NEUTER, offsetDays: 7, notBeforeAgeDays: 56 },
];

const createProtocol = async (overrides: Partial<MedicalProtocolInput> = {}) => {
  const name = uniqueName("Puppy");
  const saved = await prisma.$transaction((tx) =>
    createMedicalProtocol(tx, {
      name,
      speciesId: dogId,
      minAgeDays: null,
      maxAgeDays: 140,
      steps: puppySteps(),
      ...overrides,
    }),
  );
  liveProtocolIds.add(saved.id);
  return { ...saved, name: overrides.name ?? name };
};

const makeAnimal = async (
  options: {
    sex?: Sex;
    birthDate?: string;
    intakeDate?: string;
    speciesId?: string;
  } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: uniqueName("Animal"),
        // 51 days old on TODAY.
        birthDate: options.birthDate ?? "2026-08-20",
        sex: options.sex ?? Sex.FEMALE,
        speciesId: options.speciesId ?? dogId,
        primaryColorId: colorId,
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: options.intakeDate ?? TODAY,
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

const apply = (animalId: string, intakeDate: CalendarDay = TODAY, today = TODAY) =>
  prisma.$transaction((tx) =>
    applyIntakeProtocol(tx, { animalId, intakeDate }, staffId, today),
  );

const entriesOf = (animalId: string) =>
  prisma.medicalEntry.findMany({
    where: { animalId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      status: true,
      itemId: true,
      procedure: true,
      examType: true,
      dueDate: true,
      notes: true,
      protocolStepId: true,
      createdById: true,
    },
  });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changeSummary: true, changedAt: true, changedById: true },
  });

const DHPP_DAYS = [
  "2026-10-10",
  "2026-10-24",
  "2026-11-07",
  "2026-11-21",
  "2026-12-05",
  "2026-12-19",
  // Jan 16 would be at 149 days, past the 140 the step stops at.
  "2027-01-02",
];

test("a puppy gets its protocol's care: one entry per dose, each naming its step, and one activity row", async () => {
  const protocol = await createProtocol();
  const [examStep, dhppStep, fecalStep, pyrantelStep, chipStep, spayStep] = protocol.stepIds;
  const animalId = await makeAnimal();

  const applied = await apply(animalId);
  assert.ok(applied);
  assert.equal(applied.protocolId, protocol.id);
  assert.equal(applied.protocolName, protocol.name);
  assert.deepEqual(applied.skipped, []);

  const entries = await entriesOf(animalId);
  // Returned by due day, then by step order: the order they were written in.
  assert.deepEqual(
    applied.entryIds,
    entries.map((entry) => entry.id),
  );
  const planned = entries.map(({ kind, itemId, procedure, examType, dueDate, notes, protocolStepId }) => ({
    kind,
    itemId,
    procedure,
    examType,
    dueDate,
    notes,
    protocolStepId,
  }));
  const care = (
    protocolStepId: string,
    dueDate: string,
    fields: Partial<(typeof planned)[number]>,
  ) => ({
    itemId: null,
    procedure: null,
    examType: null,
    notes: null,
    dueDate,
    protocolStepId,
    ...fields,
  });
  const exam = care(examStep, "2026-10-10", {
    kind: MedicalEntryKind.EXAM,
    examType: ExamType.INTAKE,
    notes: "Weigh on arrival.",
  });
  const dhpp = (dueDate: string) =>
    care(dhppStep, dueDate, { kind: MedicalEntryKind.VACCINE, itemId: dhppId });
  const pyrantel = (dueDate: string) =>
    care(pyrantelStep, dueDate, { kind: MedicalEntryKind.TREATMENT, itemId: pyrantelId });
  assert.deepEqual(planned, [
    exam,
    dhpp(DHPP_DAYS[0]),
    pyrantel("2026-10-10"),
    care(chipStep, "2026-10-10", { kind: MedicalEntryKind.MICROCHIP }),
    care(fecalStep, "2026-10-13", { kind: MedicalEntryKind.TEST, itemId: fecalId }),
    // Seven days after intake: 58 days old, past the 56 it waits for.
    care(spayStep, "2026-10-17", {
      kind: MedicalEntryKind.SURGERY,
      procedure: SurgeryProcedure.SPAY,
    }),
    dhpp(DHPP_DAYS[1]),
    pyrantel("2026-10-24"),
    dhpp(DHPP_DAYS[2]),
    pyrantel("2026-11-07"),
    ...DHPP_DAYS.slice(3).map(dhpp),
  ]);
  assert.ok(
    entries.every(
      (entry) => entry.status === MedicalEntryStatus.SCHEDULED && entry.createdById === staffId,
    ),
  );

  // Each entry's CREATED event names its step, as the row does.
  const events = await prisma.medicalEntryEvent.findMany({
    where: { entryId: { in: applied.entryIds } },
    select: { entryId: true, action: true, actorId: true, after: true },
  });
  assert.equal(events.length, entries.length);
  for (const entry of entries) {
    const event = events.find((row) => row.entryId === entry.id);
    assert.equal(event?.action, MedicalEntryEventAction.CREATED);
    assert.equal(event?.actorId, staffId);
    assert.deepEqual(event?.after, {
      kind: entry.kind,
      status: MedicalEntryStatus.SCHEDULED,
      ...(entry.itemId && { itemId: entry.itemId }),
      ...(entry.procedure && { procedure: entry.procedure }),
      ...(entry.examType && { examType: entry.examType }),
      dueDate: entry.dueDate,
      notes: entry.notes,
      protocolStepId: entry.protocolStepId,
    });
  }

  // One row for the protocol, none per entry.
  const activity = await activityOf(animalId);
  assert.deepEqual(
    activity.map(({ activityType, changeSummary, changedById }) => ({
      activityType,
      changeSummary,
      changedById,
    })),
    [
      {
        activityType: AnimalActivityType.MEDICAL_PROTOCOL_APPLIED,
        changeSummary: `${protocol.name} protocol applied: 14 entries scheduled, Oct 10, 2026 to Jan 2, 2027.`,
        changedById: staffId,
      },
    ],
  );
  assert.equal(applied.loggedAt.getTime(), activity[0].changedAt.getTime());
});

test("an animal no live protocol fits gets nothing: no entry, no activity, null", async () => {
  await createProtocol();
  // 140 days old on TODAY: the range stops short of it.
  const tooOld = await makeAnimal({ birthDate: "2026-05-23" });
  const bird = await makeAnimal({ speciesId: birdId });

  for (const animalId of [tooOld, bird]) {
    assert.equal(await apply(animalId), null);
    assert.deepEqual(await entriesOf(animalId), []);
    assert.deepEqual(await activityOf(animalId), []);
  }
});

test("an animal that has left the shelter's care is refused, and nothing is written", async () => {
  // A protocol that schedules nothing for it, so the refusal is the apply's
  // own and not the entry service's.
  await createProtocol({ steps: [{ kind: MedicalProtocolStepKind.SPAY_NEUTER, offsetDays: 0 }] });
  const animalId = await makeAnimal({ sex: Sex.UNKNOWN });
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  await assert.rejects(apply(animalId), (error: Error) => {
    assert.ok(error instanceof MedicalEntryRefusal);
    assert.match(error.message, /has left the shelter's care/);
    return true;
  });
  assert.deepEqual(await entriesOf(animalId), []);
  assert.deepEqual(await activityOf(animalId), []);
});

test("a retired protocol is never applied", async () => {
  const protocol = await createProtocol();
  await prisma.medicalProtocol.update({
    where: { id: protocol.id },
    data: { retiredAt: new Date() },
  });
  const animalId = await makeAnimal();

  assert.equal(await apply(animalId), null);
  assert.deepEqual(await entriesOf(animalId), []);
});

test("an intake recorded late starts its care today: no due day before it", async () => {
  await createProtocol();
  // Arrived Sep 1 at 31 days old; recorded on TODAY.
  const animalId = await makeAnimal({ birthDate: "2026-08-01", intakeDate: "2026-09-01" });

  const applied = await apply(animalId, day("2026-09-01"));
  assert.ok(applied);

  const entries = await entriesOf(animalId);
  const firstDue = (kind: MedicalEntryKind) =>
    entries.find((entry) => entry.kind === kind)?.dueDate;
  // Every step's first dose would have fallen on or before today.
  for (const kind of [
    MedicalEntryKind.EXAM,
    MedicalEntryKind.VACCINE,
    MedicalEntryKind.TEST,
    MedicalEntryKind.TREATMENT,
    MedicalEntryKind.MICROCHIP,
    MedicalEntryKind.SURGERY,
  ]) {
    assert.equal(firstDue(kind), TODAY, kind);
  }
  assert.ok(entries.every((entry) => entry.dueDate! >= TODAY));
});

test("a step is left out for the animal's sex and record, and each one left out is named", async () => {
  const protocol = await createProtocol();
  const [, dhppStep, , , chipStep, spayStep] = protocol.stepIds;
  const stepOf = async (animalId: string, kind: MedicalEntryKind) =>
    (await entriesOf(animalId)).filter((entry) => entry.kind === kind);

  // A male gets a neuter.
  const male = await makeAnimal({ sex: Sex.MALE });
  await apply(male);
  assert.deepEqual(
    (await stepOf(male, MedicalEntryKind.SURGERY)).map((entry) => entry.procedure),
    [SurgeryProcedure.NEUTER],
  );

  // An animal of unknown sex gets no spay/neuter.
  const unknown = await makeAnimal({ sex: Sex.UNKNOWN });
  const unknownApplied = await apply(unknown);
  assert.deepEqual(unknownApplied?.skipped, [
    { stepId: spayStep, label: "spay/neuter", reason: "SEX_UNKNOWN" },
  ]);
  assert.deepEqual(await stepOf(unknown, MedicalEntryKind.SURGERY), []);
  assert.equal(
    (await activityOf(unknown))[0].changeSummary,
    `${protocol.name} protocol applied: 13 entries scheduled, Oct 10, 2026 to Jan 2, 2027. Not scheduled: spay/neuter (sex unknown).`,
  );

  // An animal that arrived spayed and chipped gets neither again.
  const altered = await makeAnimal();
  await prisma.$transaction(async (tx) => {
    await recordMedicalEntry(
      tx,
      {
        animalId: altered,
        kind: MedicalEntryKind.SURGERY,
        procedure: SurgeryProcedure.SPAY,
        evidence: SurgeryEvidence.SCAR,
        completedDate: null,
        source: MedicalEntrySource.BEFORE_INTAKE,
      },
      staffId,
      TODAY,
    );
    await recordMedicalEntry(
      tx,
      {
        animalId: altered,
        kind: MedicalEntryKind.MICROCHIP,
        chipNumber: `9${Date.now()}`.slice(0, 15),
        completedDate: null,
        source: MedicalEntrySource.BEFORE_INTAKE,
      },
      staffId,
      TODAY,
    );
  });
  const alteredApplied = await apply(altered);
  assert.deepEqual(alteredApplied?.skipped, [
    { stepId: chipStep, label: "microchip", reason: "ALREADY_CHIPPED" },
    { stepId: spayStep, label: "spay/neuter", reason: "ALREADY_ALTERED" },
  ]);
  assert.deepEqual(
    (await entriesOf(altered)).filter(
      (entry) =>
        entry.status === MedicalEntryStatus.SCHEDULED &&
        (entry.kind === MedicalEntryKind.SURGERY || entry.kind === MedicalEntryKind.MICROCHIP),
    ),
    [],
  );
  assert.match(
    (await activityOf(altered)).at(-1)?.changeSummary ?? "",
    / Not scheduled: microchip \(already microchipped\) and spay\/neuter \(already spayed or neutered\)\.$/,
  );

  // An exemption that holds on the intake day is left alone.
  const exempt = await makeAnimal();
  await prisma.$transaction((tx) =>
    recordSpayNeuterExemption(
      tx,
      {
        animalId: exempt,
        procedure: SurgeryProcedure.SPAY,
        exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
        reviewDate: day("2026-12-01"),
      },
      staffId,
      TODAY,
    ),
  );
  const exemptApplied = await apply(exempt);
  assert.deepEqual(exemptApplied?.skipped, [
    { stepId: spayStep, label: "spay/neuter", reason: "EXEMPT" },
  ]);

  // A returning animal's DHPP still open is kept, and no second one planned.
  const returning = await makeAnimal();
  const leftover = await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      {
        animalId: returning,
        kind: MedicalEntryKind.VACCINE,
        itemId: dhppId,
        dueDate: day("2026-10-12"),
      },
      staffId,
      TODAY,
    ),
  );
  const returningApplied = await apply(returning);
  assert.deepEqual(returningApplied?.skipped, [
    { stepId: dhppStep, label: dhppName, reason: "ALREADY_SCHEDULED" },
  ]);
  assert.deepEqual(
    (await stepOf(returning, MedicalEntryKind.VACCINE)).map((entry) => entry.id),
    [leftover.entryId],
  );
});

test("an exemption is read on the intake day: holding then, it skips the spay though it has lapsed by today", async () => {
  const protocol = await createProtocol();
  const spayStep = protocol.stepIds[5];
  const intakeDate = day("2026-09-01");
  const exemptAt = async (animalId: string, recordedOn: CalendarDay, reviewDate: CalendarDay) =>
    prisma.$transaction((tx) =>
      recordSpayNeuterExemption(
        tx,
        {
          animalId,
          procedure: SurgeryProcedure.SPAY,
          exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
          reviewDate,
        },
        staffId,
        recordedOn,
      ),
    );
  const spays = async (animalId: string) =>
    (await entriesOf(animalId)).filter(
      (entry) =>
        entry.kind === MedicalEntryKind.SURGERY && entry.status === MedicalEntryStatus.SCHEDULED,
    );

  // Arrived Sep 1, recorded on TODAY (Oct 10); its exemption held until
  // Sep 30, so it held on the intake day.
  const heldOnIntake = await makeAnimal({ intakeDate });
  await exemptAt(heldOnIntake, intakeDate, day("2026-09-30"));
  const held = await apply(heldOnIntake, intakeDate);
  assert.deepEqual(held?.skipped, [{ stepId: spayStep, label: "spay/neuter", reason: "EXEMPT" }]);
  assert.deepEqual(await spays(heldOnIntake), []);

  // Its review day passed before it arrived: the spay is scheduled, from
  // today's plan.
  const lapsedOnIntake = await makeAnimal({ intakeDate });
  await exemptAt(lapsedOnIntake, day("2026-08-20"), day("2026-08-31"));
  const lapsed = await apply(lapsedOnIntake, intakeDate);
  assert.deepEqual(lapsed?.skipped, []);
  // 56 days old on Oct 15, after the step's offset and today.
  assert.deepEqual(
    (await spays(lapsedOnIntake)).map((entry) => [entry.procedure, entry.dueDate, entry.protocolStepId]),
    [[SurgeryProcedure.SPAY, "2026-10-15", spayStep]],
  );
});

test("a step whose item was retired after the protocol was saved is left out and named", async () => {
  const { id: itemId, name: itemName } = await newItem(MedicalItemKind.TEST, "Old snap test");
  const protocol = await createProtocol({
    steps: [
      { kind: MedicalProtocolStepKind.EXAM, examType: ExamType.INTAKE, offsetDays: 0 },
      { kind: MedicalProtocolStepKind.TEST, itemId, offsetDays: 0 },
    ],
  });
  await prisma.$transaction((tx) => retireMedicalItem(tx, itemId));
  const animalId = await makeAnimal();

  const applied = await apply(animalId);
  assert.deepEqual(applied?.skipped, [
    { stepId: protocol.stepIds[1], label: itemName, reason: "ITEM_RETIRED" },
  ]);
  assert.deepEqual(
    (await entriesOf(animalId)).map((entry) => entry.kind),
    [MedicalEntryKind.EXAM],
  );
  assert.equal(
    (await activityOf(animalId))[0].changeSummary,
    `${protocol.name} protocol applied: 1 entry scheduled, on Oct 10, 2026. Not scheduled: ${itemName} (retired from the catalog).`,
  );
});

test("a protocol whose every step is left out says so", async () => {
  const protocol = await createProtocol({
    steps: [{ kind: MedicalProtocolStepKind.SPAY_NEUTER, offsetDays: 0 }],
  });
  const animalId = await makeAnimal({ sex: Sex.UNKNOWN });

  const applied = await apply(animalId);
  assert.deepEqual(applied?.entryIds, []);
  assert.equal(
    (await activityOf(animalId))[0].changeSummary,
    `${protocol.name} protocol applied: nothing scheduled. Not scheduled: spay/neuter (sex unknown).`,
  );
});

test("editing a protocol after it was applied leaves its entries as they were", async () => {
  const protocol = await createProtocol();
  const animalId = await makeAnimal();
  await apply(animalId);
  const before = await entriesOf(animalId);

  // DHPP's step changes (a new one replaces it), and the fecal test goes.
  const steps = puppySteps().map((step, index) => ({ ...step, id: protocol.stepIds[index] }));
  steps[1] = { ...steps[1], repeatIntervalDays: 21 };
  steps.splice(2, 1);
  await prisma.$transaction((tx) =>
    updateMedicalProtocol(tx, protocol.id, {
      name: protocol.name,
      speciesId: dogId,
      minAgeDays: null,
      maxAgeDays: 140,
      steps,
    }),
  );

  assert.deepEqual(await entriesOf(animalId), before);
  const oldSteps = await prisma.medicalProtocolStep.findMany({
    where: { id: { in: [protocol.stepIds[1], protocol.stepIds[2]] } },
    select: { retiredAt: true },
  });
  assert.equal(oldSteps.length, 2);
  assert.ok(oldSteps.every((step) => step.retiredAt !== null));
});

test("a protocol entry names its protocol on the animal's due list, the Due page and its change history, by its name now", async () => {
  const protocol = await createProtocol();
  const animalId = await makeAnimal();
  await apply(animalId);
  const renamed = uniqueName("Young dog");
  await prisma.medicalProtocol.update({ where: { id: protocol.id }, data: { name: renamed } });

  const due = await findDueMedicalEntries(prisma, animalId);
  assert.equal(due.length, 14);
  assert.ok(due.every((entry) => entry.protocolStep?.protocol.name === renamed));

  const names = await findEventNames(prisma, due);
  for (const stepId of protocol.stepIds) {
    assert.equal(names[stepId], renamed);
  }

  const shelterWide = (await findMedicalDue(prisma, TODAY, { upcomingDays: 7 })).filter(
    (row) => row.animal.id === animalId,
  );
  assert.ok(shelterWide.length > 0);
  assert.ok(shelterWide.every((row) => row.entry.protocolStep?.protocol.name === renamed));

  // Care scheduled by hand names none.
  const other = await makeAnimal({ speciesId: birdId });
  await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId: other, kind: MedicalEntryKind.TEST, itemId: fecalId, dueDate: TODAY },
      staffId,
      TODAY,
    ),
  );
  assert.deepEqual(
    (await findDueMedicalEntries(prisma, other)).map((entry) => entry.protocolStep),
    [null],
  );
});

// --- Concurrency -----------------------------------------------------------

// Longer than the five seconds `waitForSessionBlockedBy` may take, so a slow
// machine fails on the wait, not on a transaction timeout.
const lockWaitTimeout = 20_000;

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

// The only proof a statement reached the lock and is blocked there. Asking
// which sessions `holderPid` blocks keeps another file's wait from passing
// for this one.
const waitForSessionBlockedBy = async (holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

test("a protocol edit waits for an application still open, then goes through", async () => {
  const protocol = await createProtocol();
  const animalId = await makeAnimal();

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  const applying = prisma.$transaction(
    async (tx) => {
      const applied = await applyIntakeProtocol(
        tx,
        { animalId, intakeDate: TODAY },
        staffId,
        TODAY,
      );
      held(await backendPid(tx));
      await released;
      return applied;
    },
    { timeout: lockWaitTimeout },
  );

  try {
    const holderPid = await Promise.race([isHeld, applying as Promise<never>]);
    // Every step left out but the exam: the edit retires them.
    const editing = prisma.$transaction(
      (tx) =>
        updateMedicalProtocol(tx, protocol.id, {
          name: protocol.name,
          speciesId: dogId,
          minAgeDays: null,
          maxAgeDays: 140,
          steps: [{ ...puppySteps()[0], id: protocol.stepIds[0] }],
        }),
      { timeout: lockWaitTimeout },
    );
    await waitForSessionBlockedBy(holderPid);
    release();

    const applied = await applying;
    await editing;
    // The application wrote what the protocol held when it ran.
    assert.equal(applied?.entryIds.length, 14);
    const entries = await entriesOf(animalId);
    assert.equal(entries.length, 14);
    const retired = await prisma.medicalProtocolStep.count({
      where: { id: { in: protocol.stepIds.slice(1) }, retiredAt: { not: null } },
    });
    assert.equal(retired, 5);
  } finally {
    release();
    await applying.catch(() => {});
  }
});

test("an item retired while the application waits for it is left out, not refused", async () => {
  const { id: itemId, name: itemName } = await newItem(MedicalItemKind.TREATMENT, "Old dewormer");
  const protocol = await createProtocol({
    steps: [
      { kind: MedicalProtocolStepKind.EXAM, examType: ExamType.INTAKE, offsetDays: 0 },
      { kind: MedicalProtocolStepKind.TREATMENT, itemId, offsetDays: 0 },
    ],
  });
  const animalId = await makeAnimal();

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  const retiring = prisma.$transaction(
    async (tx) => {
      await retireMedicalItem(tx, itemId);
      held(await backendPid(tx));
      await released;
    },
    { timeout: lockWaitTimeout },
  );

  try {
    const holderPid = await Promise.race([isHeld, retiring as Promise<never>]);
    const applying = prisma.$transaction(
      (tx) => applyIntakeProtocol(tx, { animalId, intakeDate: TODAY }, staffId, TODAY),
      { timeout: lockWaitTimeout },
    );
    await waitForSessionBlockedBy(holderPid);
    release();
    await retiring;

    const applied = await applying;
    assert.deepEqual(applied?.skipped, [
      { stepId: protocol.stepIds[1], label: itemName, reason: "ITEM_RETIRED" },
    ]);
    assert.deepEqual(
      (await entriesOf(animalId)).map((entry) => entry.kind),
      [MedicalEntryKind.EXAM],
    );
  } finally {
    release();
    await retiring.catch(() => {});
  }
});

test("an application that waited while its protocol was retired schedules nothing", async () => {
  const protocol = await createProtocol();
  const animalId = await makeAnimal();

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  const retiring = prisma.$transaction(
    async (tx) => {
      await retireMedicalProtocol(tx, protocol.id);
      held(await backendPid(tx));
      await released;
    },
    { timeout: lockWaitTimeout },
  );

  try {
    const holderPid = await Promise.race([isHeld, retiring as Promise<never>]);
    // It reads the protocol as live (the retirement isn't committed), then
    // waits for its lock.
    const applying = prisma.$transaction(
      (tx) => applyIntakeProtocol(tx, { animalId, intakeDate: TODAY }, staffId, TODAY),
      { timeout: lockWaitTimeout },
    );
    await waitForSessionBlockedBy(holderPid);
    release();
    await retiring;

    assert.equal(await applying, null);
    assert.deepEqual(await entriesOf(animalId), []);
    assert.deepEqual(await activityOf(animalId), []);
  } finally {
    release();
    await retiring.catch(() => {});
  }
});

test("an application that waited while its protocol's ages changed applies the protocol that fits it then", async () => {
  const puppy = await createProtocol();
  const animalId = await makeAnimal();
  const olderName = uniqueName("Older puppy");

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  // Puppy narrowed to under 40 days, and a new protocol for 40 to 140 days:
  // the animal, 51 days old, moves from one to the other.
  const changing = prisma.$transaction(
    async (tx) => {
      await updateMedicalProtocol(tx, puppy.id, {
        name: puppy.name,
        speciesId: dogId,
        minAgeDays: null,
        maxAgeDays: 40,
        steps: puppySteps().map((step, index) => ({ ...step, id: puppy.stepIds[index] })),
      });
      const older = await createMedicalProtocol(tx, {
        name: olderName,
        speciesId: dogId,
        minAgeDays: 40,
        maxAgeDays: 140,
        steps: [{ kind: MedicalProtocolStepKind.EXAM, examType: ExamType.INTAKE, offsetDays: 0 }],
      });
      held(await backendPid(tx));
      await released;
      return older;
    },
    { timeout: lockWaitTimeout },
  );

  try {
    const holderPid = await Promise.race([isHeld, changing as Promise<never>]);
    const applying = prisma.$transaction(
      (tx) => applyIntakeProtocol(tx, { animalId, intakeDate: TODAY }, staffId, TODAY),
      { timeout: lockWaitTimeout },
    );
    await waitForSessionBlockedBy(holderPid);
    release();
    const older = await changing;
    liveProtocolIds.add(older.id);

    const applied = await applying;
    assert.equal(applied?.protocolId, older.id);
    assert.deepEqual(
      (await entriesOf(animalId)).map((entry) => [entry.kind, entry.protocolStepId]),
      [[MedicalEntryKind.EXAM, older.stepIds[0]]],
    );
    assert.match(
      (await activityOf(animalId))[0].changeSummary ?? "",
      new RegExp(`^${olderName} protocol applied: 1 entry scheduled`),
    );
  } finally {
    release();
    await changing.catch(() => {});
  }
});
