// One spay or neuter per animal, against a real Postgres: a second one given,
// or a second one scheduled, is refused by every entry-service writer, and a
// writer that skipped the check would be stopped by the partial unique
// indexes. A spay and a neuter are one surgery here.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  IntakeType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  recordSpayNeuterExemption,
  rescheduleMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type SurgeryEntryInput,
} from "@/app/lib/services/medical-entry";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let speciesId: string;
let colorId: string;
let staffId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Duplicate species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Duplicate color") },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: name("Duplicate staff") },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, sex: Sex = Sex.FEMALE) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex,
        speciesId,
        primaryColorId: colorId,
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: INTAKE_DAY,
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

const surgery = (overrides: Partial<SurgeryEntryInput> = {}): SurgeryEntryInput => ({
  kind: MedicalEntryKind.SURGERY,
  procedure: SurgeryProcedure.SPAY,
  completedDate: day("2026-10-03"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

// Done before she came in, on a day nobody knows: it counts as fully as one
// done here.
const scarred = (procedure: SurgeryProcedure = SurgeryProcedure.SPAY) =>
  surgery({
    procedure,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.SCAR,
  });

const record = (animalId: string, input: SurgeryEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY),
  );

const schedule = (
  animalId: string,
  procedure: SurgeryProcedure = SurgeryProcedure.SPAY,
  dueDate: CalendarDay = day("2026-10-14"),
) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.SURGERY, procedure, dueDate },
      staffId,
      TODAY,
    ),
  );

const recordScheduled = (entryId: string, input: SurgeryEntryInput) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(tx, entryId, input, staffId, TODAY),
  );

const voidEntry = (entryId: string, reason = "Entered in error.") =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, staffId));

// Everything a refused write could have left behind on the animal.
const footprint = async (animalId: string) => ({
  entries: await prisma.medicalEntry.findMany({
    where: { animalId },
    orderBy: { id: "asc" },
    select: { id: true, status: true, procedure: true, dueDate: true, updatedAt: true },
  }),
  events: await prisma.medicalEntryEvent.count({ where: { entry: { animalId } } }),
  activity: await prisma.animalActivityLog.count({ where: { animalId } }),
});

/** Refused with a `MedicalEntryRefusal`, writing nothing. */
const refuses = async (
  animalId: string,
  write: () => Promise<unknown>,
  message: string,
  field?: string,
) => {
  const before = await footprint(animalId);
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.message, message);
    assert.equal(error.field, field);
    return true;
  });
  assert.deepEqual(await footprint(animalId), before);
};

const SPAYED_RECORD =
  "This animal is already spayed on its record, so another spay or neuter can't be recorded. Correct that entry, or record a follow-up surgery as Other.";
const SPAYED_SCHEDULE =
  "This animal is already spayed on its record, so no spay or neuter can be scheduled.";

// ---------------------------------------------------------------------------
// Recording a new spay or neuter
// ---------------------------------------------------------------------------

test("a spay known only from a scar blocks recording another spay or a neuter", async () => {
  const animalId = await makeAnimal("Scarred", Sex.UNKNOWN);
  await record(animalId, scarred());

  await refuses(animalId, () => record(animalId, surgery()), SPAYED_RECORD, "procedure");
  await refuses(
    animalId,
    () => record(animalId, surgery({ procedure: SurgeryProcedure.NEUTER })),
    SPAYED_RECORD,
    "procedure",
  );
  await refuses(
    animalId,
    () => record(animalId, scarred(SurgeryProcedure.NEUTER)),
    SPAYED_RECORD,
    "procedure",
  );
});

test("a follow-up surgery is recorded as Other", async () => {
  const animalId = await makeAnimal("Follow-up");
  await record(animalId, surgery());
  const { entryId } = await record(
    animalId,
    surgery({
      procedure: SurgeryProcedure.OTHER,
      completedDate: day("2026-10-08"),
      notes: "Incision reopened after the Oct 3 spay; closed again.",
    }),
  );
  assert.equal(
    (await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } })).status,
    MedicalEntryStatus.COMPLETED,
  );
});

test("a voided spay doesn't count, nor does an exemption", async () => {
  const animalId = await makeAnimal("Voided first");
  const wrong = await record(animalId, surgery());
  await voidEntry(wrong.entryId, "Recorded on the wrong animal.");
  await record(animalId, surgery({ completedDate: day("2026-10-05") }));

  const exempt = await makeAnimal("Exempt");
  await prisma.$transaction((tx) =>
    recordSpayNeuterExemption(
      tx,
      {
        animalId: exempt,
        procedure: SurgeryProcedure.SPAY,
        exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
      },
      staffId,
      TODAY,
    ),
  );
  await record(exempt, surgery());
});

test("an open appointment doesn't stop the spay being recorded on its own; both stay", async () => {
  const animalId = await makeAnimal("Spayed elsewhere");
  const appointment = await schedule(animalId);
  await record(animalId, scarred());

  const left = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: appointment.entryId },
  });
  assert.equal(left.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(left.voidedAt, null);
});

// ---------------------------------------------------------------------------
// Scheduling and rescheduling
// ---------------------------------------------------------------------------

test("no spay or neuter is scheduled for an animal already altered", async () => {
  const animalId = await makeAnimal("Altered", Sex.UNKNOWN);
  await record(animalId, scarred());
  await refuses(animalId, () => schedule(animalId), SPAYED_SCHEDULE, "procedure");
  await refuses(
    animalId,
    () => schedule(animalId, SurgeryProcedure.NEUTER),
    SPAYED_SCHEDULE,
    "procedure",
  );
  // Other surgery can still be planned.
  await schedule(animalId, SurgeryProcedure.DENTAL);
});

test("a second spay or neuter appointment is refused, whatever its day", async () => {
  const animalId = await makeAnimal("Booked", Sex.UNKNOWN);
  const first = await schedule(animalId, SurgeryProcedure.SPAY, day("2026-10-14"));
  const message =
    "A spay is already scheduled for this animal, due Oct 14, 2026. Reschedule that one instead.";
  await refuses(
    animalId,
    () => schedule(animalId, SurgeryProcedure.SPAY, day("2026-11-20")),
    message,
    "procedure",
  );
  await refuses(
    animalId,
    () => schedule(animalId, SurgeryProcedure.NEUTER, day("2026-10-14")),
    message,
    "procedure",
  );

  // Voided, it no longer holds the place.
  await voidEntry(first.entryId, "Booked with the wrong clinic.");
  await schedule(animalId, SurgeryProcedure.SPAY, day("2026-10-21"));
});

test("an appointment is rescheduled freely, but not once the spay is on the record", async () => {
  const animalId = await makeAnimal("Moved");
  const { entryId } = await schedule(animalId);
  const move = (dueDate: CalendarDay) =>
    prisma.$transaction((tx) =>
      rescheduleMedicalEntry(tx, entryId, dueDate, staffId, TODAY),
    );
  await move(day("2026-10-16"));

  await record(animalId, scarred());
  await refuses(
    animalId,
    () => move(day("2026-10-18")),
    "This animal is already spayed on its record. Void this scheduled spay instead.",
  );
  // What it says to do works.
  await voidEntry(entryId, "Found already spayed.");
});

// ---------------------------------------------------------------------------
// Completing an appointment
// ---------------------------------------------------------------------------

test("an appointment can't be recorded as given once the spay is on the record", async () => {
  const animalId = await makeAnimal("Stale appointment");
  const { entryId } = await schedule(animalId);
  await record(animalId, scarred());

  // The procedure is the one planned, so the sex rule doesn't run; this does.
  await refuses(
    animalId,
    () => recordScheduled(entryId, surgery()),
    "This animal is already spayed on its record. Void this scheduled spay instead.",
  );
  const kept = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(kept.status, MedicalEntryStatus.SCHEDULED);
});

test("a scheduled dental can't be recorded as a spay for an animal already spayed", async () => {
  const animalId = await makeAnimal("Dental planned");
  const { entryId } = await schedule(animalId, SurgeryProcedure.DENTAL);
  await record(animalId, scarred());

  await refuses(
    animalId,
    () => recordScheduled(entryId, surgery()),
    SPAYED_RECORD,
    "procedure",
  );
  await recordScheduled(entryId, surgery({ procedure: SurgeryProcedure.DENTAL }));
});

test("the appointment is recorded as the spay it was", async () => {
  const animalId = await makeAnimal("Kept appointment");
  const { entryId } = await schedule(animalId);
  await recordScheduled(entryId, surgery({ completedDate: day("2026-10-09") }));
  const given = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(given.status, MedicalEntryStatus.COMPLETED);
});

// ---------------------------------------------------------------------------
// Correcting what was recorded
// ---------------------------------------------------------------------------

test("a surgery corrected into a spay is refused when one is on the record", async () => {
  const animalId = await makeAnimal("Mislabelled");
  await record(animalId, scarred());
  const { entryId } = await record(
    animalId,
    surgery({ procedure: SurgeryProcedure.MASS_REMOVAL }),
  );
  await refuses(
    animalId,
    () =>
      prisma.$transaction((tx) =>
        editMedicalEntry(
          tx,
          entryId,
          surgery({ procedure: SurgeryProcedure.SPAY }),
          staffId,
          TODAY,
        ),
      ),
    SPAYED_RECORD,
    "procedure",
  );
});

test("the one spay can still be corrected: its notes, its date, spay to neuter, or to another surgery", async () => {
  const animalId = await makeAnimal("Corrected", Sex.UNKNOWN);
  const { entryId } = await record(animalId, scarred());
  const edit = (input: SurgeryEntryInput) =>
    prisma.$transaction((tx) => editMedicalEntry(tx, entryId, input, staffId, TODAY));

  await edit(scarred(SurgeryProcedure.SPAY));
  await edit({ ...scarred(), notes: "Tattoo found too." });
  await edit(surgery({ completedDate: day("2026-07-01"), source: MedicalEntrySource.BEFORE_INTAKE, evidence: SurgeryEvidence.VET_RECORDS }));
  await edit(surgery({
    procedure: SurgeryProcedure.NEUTER,
    completedDate: day("2026-07-01"),
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.VET_RECORDS,
  }));
  await edit(surgery({
    procedure: SurgeryProcedure.OTHER,
    completedDate: day("2026-07-01"),
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.VET_RECORDS,
  }));
  // Nothing on the record now, so one can be recorded.
  await record(animalId, surgery({ procedure: SurgeryProcedure.NEUTER }));
});

// ---------------------------------------------------------------------------
// The indexes
// ---------------------------------------------------------------------------

test("a writer that skips the service is stopped by the indexes", async () => {
  const animalId = await makeAnimal("Raw writer");
  // Scheduled first: once it is given, nothing can be.
  await schedule(animalId, SurgeryProcedure.SPAY, day("2026-10-20"));
  await record(animalId, scarred());

  const raw = (status: MedicalEntryStatus) =>
    prisma.medicalEntry.create({
      data: {
        animalId,
        kind: MedicalEntryKind.SURGERY,
        procedure: SurgeryProcedure.NEUTER,
        status,
        ...(status === MedicalEntryStatus.SCHEDULED
          ? { dueDate: day("2026-10-25") }
          : { completedDate: day("2026-10-04"), source: MedicalEntrySource.IN_HOUSE }),
        createdById: staffId,
      },
    });
  const unique = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  await assert.rejects(raw(MedicalEntryStatus.COMPLETED), unique);
  await assert.rejects(raw(MedicalEntryStatus.SCHEDULED), unique);
  // Declined and other surgeries aren't held to one.
  await raw(MedicalEntryStatus.DECLINED);
});

// ---------------------------------------------------------------------------
// At once
// ---------------------------------------------------------------------------

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// The only proof a statement reached the lock and is blocked there, rather
// than not having started yet. Asking which sessions `holderPid` blocks keeps
// another test file's wait (the files run in parallel) from passing for this
// one.
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

/**
 * Runs `first` and holds its transaction open until `second` is seen waiting
 * on the animal's lock behind it, then lets both finish. Returns what
 * `second` was refused with.
 */
const second = async (
  first: (tx: TransactionClient) => Promise<unknown>,
  then: (tx: TransactionClient) => Promise<unknown>,
) => {
  // Longer than the five seconds the wait may take, so a slow machine fails
  // on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let written!: (pid: number) => void;
  const isWritten = new Promise<number>((resolve) => (written = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await first(tx);
      written(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isWritten, holder as Promise<never>]);
  const waiting = prisma.$transaction(then, { timeout });
  void waiting.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, waiting]);
  }
  await holder;
  return waiting.then(
    () => assert.fail("The second write should have been refused."),
    (rejection: unknown) => rejection,
  );
};

test("two spays recorded at once: the second waits for the lock and is refused", async () => {
  const animalId = await makeAnimal("Recorded twice", Sex.UNKNOWN);
  const error = await second(
    (tx) => recordMedicalEntry(tx, { ...surgery(), animalId }, staffId, TODAY),
    (tx) =>
      recordMedicalEntry(
        tx,
        { ...scarred(SurgeryProcedure.NEUTER), animalId },
        staffId,
        TODAY,
      ),
  );
  // The service's own refusal, read after the first committed; not the index.
  assert.ok(error instanceof MedicalEntryRefusal, String(error));
  assert.equal(error.message, SPAYED_RECORD);
  assert.equal(
    await prisma.medicalEntry.count({
      where: { animalId, status: MedicalEntryStatus.COMPLETED },
    }),
    1,
  );
});

test("an appointment completed while the spay is recorded: the second is refused", async () => {
  const animalId = await makeAnimal("Completed twice");
  const { entryId } = await schedule(animalId);
  const error = await second(
    (tx) => recordScheduledMedicalEntry(tx, entryId, surgery(), staffId, TODAY),
    (tx) => recordMedicalEntry(tx, { ...scarred(), animalId }, staffId, TODAY),
  );
  assert.ok(error instanceof MedicalEntryRefusal, String(error));
  assert.equal(error.message, SPAYED_RECORD);
});

test("two spays scheduled at once: the second is refused", async () => {
  const animalId = await makeAnimal("Scheduled twice");
  const error = await second(
    (tx) =>
      scheduleMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.SURGERY,
          procedure: SurgeryProcedure.SPAY,
          dueDate: day("2026-10-14"),
        },
        staffId,
        TODAY,
      ),
    (tx) =>
      scheduleMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.SURGERY,
          procedure: SurgeryProcedure.SPAY,
          dueDate: day("2026-10-15"),
        },
        staffId,
        TODAY,
      ),
  );
  assert.ok(error instanceof MedicalEntryRefusal, String(error));
  assert.equal(
    error.message,
    "A spay is already scheduled for this animal, due Oct 14, 2026. Reschedule that one instead.",
  );
  assert.equal(
    await prisma.medicalEntry.count({
      where: { animalId, status: MedicalEntryStatus.SCHEDULED },
    }),
    1,
  );
});
