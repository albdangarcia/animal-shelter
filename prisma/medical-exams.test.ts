// Exams in the medical record, against a real Postgres: scheduled, recorded,
// corrected, declined and voided through the entry service, as the actions
// drive it. An exam has no catalog item; its type says which exam it is, it
// has a finding for every body system, and an intake exam is dated in the
// stay it starts.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  PartnerType,
  ReproductiveStatus,
  Sex,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  declineMedicalEntry,
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  rescheduleMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type ExamEntryInput,
  type MedicalEntryInput,
  type RecordMedicalEntryInput,
} from "@/app/lib/services/medical-entry";
import {
  recordMedicalBatch,
  recordScheduledMedicalBatch,
  type MedicalBatchInput,
} from "@/app/lib/services/medical-batch";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import {
  findLatestRabiesVaccine,
  findMedicalHistoryPage,
  findRecentMedicalEntries,
  findVaccinesAndTests,
} from "@/app/lib/data/animals/medical-entry";
import { findMedicalStatus } from "@/app/lib/data/animals/medical-status";
import { EXAM_BODY_SYSTEM_KEYS } from "@/app/lib/constants/exam";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;
const { NORMAL, ABNORMAL, NOT_EXAMINED } = ExamFindingStatus;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let clinicId: string;
let rabiesId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Exam species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Exam color") },
      select: { id: true },
    })
  ).id;
  const person = async (label: string) =>
    (
      await prisma.person.create({
        data: { name: name(label) },
        select: { id: true },
      })
    ).id;
  staffId = await person("Exam staff");
  editorId = await person("Exam editor");
  clinicId = (
    await prisma.partner.create({
      data: { name: name("Exam clinic"), type: PartnerType.VET_CLINIC },
      select: { id: true },
    })
  ).id;
  rabiesId = (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.VACCINE,
        name: name("Rabies"),
        speciesIds: [],
        isRabies: true,
        analytes: [],
      }),
    )
  ).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, findings, events and activity rows.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.partner.deleteMany({ where: { id: clinicId } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** An animal that arrived on each of `intakeDays`, the first by default. */
const makeAnimal = async (
  label: string,
  intakeDays: CalendarDay[] = [INTAKE_DAY],
  sex: Sex = Sex.FEMALE,
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex,
        speciesId,
        primaryColorId: colorId,
        intake: {
          create: intakeDays.map((intakeDate) => ({
            type: IntakeType.STRAY,
            intakeDate,
            staffMemberId: staffId,
          })),
        },
      },
      select: { id: true },
    })
  ).id;

/** A finding for every body system: Normal, unless named in `overrides`. */
const findings = (
  overrides: Record<string, { status: ExamFindingStatus; notes?: string | null }> = {},
) =>
  EXAM_BODY_SYSTEM_KEYS.map((bodySystem) => ({
    bodySystem,
    status: overrides[bodySystem]?.status ?? NORMAL,
    notes: overrides[bodySystem]?.notes ?? null,
  }));

const exam = (overrides: Partial<ExamEntryInput> = {}): ExamEntryInput => ({
  kind: MedicalEntryKind.EXAM,
  examType: ExamType.INTAKE,
  overallResult: ExamResult.NO_CONCERNS,
  completedDate: day("2026-10-03"),
  source: MedicalEntrySource.IN_HOUSE,
  findings: findings(),
  ...overrides,
});

// The shelter's weight unit, for the text of an exam's vitals.
const UNITS = { weightUnitSystem: "metric" } as const;

const record = (animalId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY, UNITS),
  );

const schedule = (
  animalId: string,
  examType: ExamType,
  dueDate: CalendarDay = day("2026-10-14"),
) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.EXAM, examType, dueDate },
      staffId,
      TODAY,
    ),
  );

const recordScheduled = (entryId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(tx, entryId, input, editorId, TODAY, UNITS),
  );

const edit = (entryId: string, input: MedicalEntryInput) =>
  prisma.$transaction((tx) => editMedicalEntry(tx, entryId, input, editorId, TODAY));

const entryOf = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { exam: true },
  });

const findingsOf = async (entryId: string) =>
  (
    await prisma.examFinding.findMany({
      where: { examDetails: { entryId } },
      select: { id: true, bodySystem: true, status: true, notes: true, updatedAt: true },
    })
  ).sort(
    (a, b) =>
      EXAM_BODY_SYSTEM_KEYS.indexOf(a.bodySystem) -
      EXAM_BODY_SYSTEM_KEYS.indexOf(b.bodySystem),
  );

const eventsOf = (entryId: string) =>
  prisma.medicalEntryEvent.findMany({
    where: { entryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: {
      animalId,
      activityType: {
        in: [
          AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
          AnimalActivityType.MEDICAL_ENTRY_RESCHEDULED,
          AnimalActivityType.MEDICAL_ENTRY_DECLINED,
          AnimalActivityType.MEDICAL_ENTRY_RECORDED,
          AnimalActivityType.MEDICAL_ENTRY_EDITED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

const summariesOf = async (animalId: string) =>
  (await activityOf(animalId)).map((row) => row.changeSummary);

/** Asserts the promise is refused on `field` with a message matching `pattern`. */
const refusedOn = async (
  promise: Promise<unknown>,
  field: string | undefined,
  pattern: RegExp,
) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    assert.match(error.message, pattern);
    return true;
  });

/** Nothing about the animal's medical record was written. */
const assertNothingWritten = async (animalId: string) => {
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
  assert.equal(await prisma.examDetails.count({ where: { entry: { animalId } } }), 0);
  assert.equal((await activityOf(animalId)).length, 0);
};

test("an in-house intake exam stores its type, result and a finding per system, with the recorder as giver", async () => {
  const animalId = await makeAnimal("In house");
  const { entryId, nextEntryId } = await record(
    animalId,
    exam({
      overallResult: ExamResult.NEEDS_VET_REVIEW,
      reproductiveStatus: ReproductiveStatus.INTACT,
      findings: findings({
        HEART: { status: ABNORMAL, notes: " Grade II/VI systolic murmur. " },
        MOUTH_TEETH: { status: NORMAL, notes: "Mild tartar." },
        NEUROLOGICAL: { status: NOT_EXAMINED, notes: "" },
      }),
    }),
  );
  assert.equal(nextEntryId, null);

  const entry = await entryOf(entryId);
  assert.equal(entry.kind, MedicalEntryKind.EXAM);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.examType, ExamType.INTAKE);
  assert.equal(entry.itemId, null);
  assert.equal(entry.procedure, null);
  assert.equal(entry.chipNumber, null);
  assert.equal(entry.completedDate, "2026-10-03");
  assert.equal(entry.source, MedicalEntrySource.IN_HOUSE);
  assert.equal(entry.administeredById, staffId);
  assert.equal(entry.exam?.overallResult, ExamResult.NEEDS_VET_REVIEW);
  assert.equal(entry.exam?.reproductiveStatus, ReproductiveStatus.INTACT);
  assert.equal(entry.exam?.vitalsLogId, null);

  const stored = await findingsOf(entryId);
  assert.equal(stored.length, 12);
  assert.deepEqual(
    stored.map(({ bodySystem, status, notes }) => ({ bodySystem, status, notes })),
    findings({
      HEART: { status: ABNORMAL, notes: "Grade II/VI systolic murmur." },
      MOUTH_TEETH: { status: NORMAL, notes: "Mild tartar." },
      NEUROLOGICAL: { status: NOT_EXAMINED, notes: null },
    }),
  );

  const [created] = await eventsOf(entryId);
  assert.equal(created.action, MedicalEntryEventAction.CREATED);
  assert.deepEqual(created.after, {
    kind: MedicalEntryKind.EXAM,
    status: MedicalEntryStatus.COMPLETED,
    itemId: null,
    completedDate: "2026-10-03",
    source: MedicalEntrySource.IN_HOUSE,
    vetPartnerId: null,
    vetName: null,
    administeredById: staffId,
    notes: null,
    examType: ExamType.INTAKE,
    overallResult: ExamResult.NEEDS_VET_REVIEW,
    reproductiveStatus: ReproductiveStatus.INTACT,
    examFindings: findings({
      HEART: { status: ABNORMAL, notes: "Grade II/VI systolic murmur." },
      MOUTH_TEETH: { status: NORMAL, notes: "Mild tartar." },
      NEUROLOGICAL: { status: NOT_EXAMINED, notes: null },
    }),
  });
  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: staffId,
      changeSummary:
        "Intake exam recorded: done in house, on Oct 3, 2026. Result: needs vet review. Abnormal: heart.",
    },
  ]);
});

test("an exam by an outside vet names the clinic, and nobody here as giver", async () => {
  const animalId = await makeAnimal("Outside vet");
  const { entryId } = await record(
    animalId,
    exam({
      examType: ExamType.VET,
      source: MedicalEntrySource.OUTSIDE_VET,
      vetPartnerId: clinicId,
      findings: findings({
        EARS: { status: ABNORMAL, notes: "Ear mites." },
        LUNGS: { status: ABNORMAL, notes: "Harsh sounds." },
      }),
      overallResult: ExamResult.NEEDS_TREATMENT,
    }),
  );
  const entry = await entryOf(entryId);
  assert.equal(entry.vetPartnerId, clinicId);
  assert.equal(entry.administeredById, null);
  assert.deepEqual(await summariesOf(animalId), [
    `Vet exam recorded: done by an outside vet at ${name("Exam clinic")}, on Oct 3, 2026. Result: needs treatment. Abnormal: ears and lungs.`,
  ]);
});

test("an exam isn't recorded before intake, and an intake exam is dated in the latest stay", async () => {
  // Arrived Aug 1, left, and came back Sep 15.
  const animalId = await makeAnimal("Returned", [INTAKE_DAY, day("2026-09-15")]);

  await refusedOn(
    record(animalId, exam({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null })),
    "source",
    /^An exam is recorded in house or by an outside vet\.$/,
  );
  await refusedOn(
    record(animalId, exam({ completedDate: day("2026-09-10") })),
    "completedDate",
    /^An intake exam is dated on or after the animal's latest intake, on Sep 15, 2026\.$/,
  );
  await assertNothingWritten(animalId);

  // Any other exam that day is care during the first stay.
  await record(animalId, exam({ examType: ExamType.VET, completedDate: day("2026-09-10") }));
  // An intake exam on the day the animal came back starts the new stay.
  await record(animalId, exam({ completedDate: day("2026-09-15") }));
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 2);
});

test("an exam's findings cover every system once, with a note on each abnormal one", async () => {
  const animalId = await makeAnimal("Findings");
  const all = findings();

  await refusedOn(
    record(animalId, exam({ findings: all.filter((row) => row.bodySystem !== "EARS") })),
    "findings",
    /^A finding is needed for Ears\.$/,
  );
  await refusedOn(
    record(animalId, exam({ findings: [...all, { bodySystem: "TAIL", status: NORMAL, notes: null }] })),
    "findings",
    /doesn't look at/,
  );
  await refusedOn(
    record(animalId, exam({ findings: [...all, { bodySystem: "EYES", status: NOT_EXAMINED, notes: null }] })),
    "findings",
    /^Eyes has more than one finding\.$/,
  );
  await refusedOn(
    record(animalId, exam({ findings: findings({ SKIN_COAT: { status: ABNORMAL, notes: "  " } }) })),
    "findings",
    /^Skin and coat is abnormal: say what was found\.$/,
  );
  await assertNothingWritten(animalId);
});

test("an exam needs its type and its overall result", async () => {
  const animalId = await makeAnimal("No type");
  await refusedOn(
    record(animalId, exam({ examType: undefined as unknown as ExamType })),
    "examType",
    /Pick the exam type/,
  );
  await refusedOn(
    record(animalId, exam({ overallResult: undefined as unknown as ExamResult })),
    "overallResult",
    /Pick the overall result/,
  );
  await refusedOn(
    schedule(animalId, null as unknown as ExamType),
    "examType",
    /Pick the exam type/,
  );
  await assertNothingWritten(animalId);
});

test("an exam is scheduled by its type, rescheduled, then recorded as given as another type", async () => {
  const animalId = await makeAnimal("Scheduled");
  const { entryId } = await schedule(animalId, ExamType.VET);

  const scheduled = await entryOf(entryId);
  assert.equal(scheduled.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(scheduled.examType, ExamType.VET);
  assert.equal(scheduled.itemId, null);
  assert.equal(scheduled.source, null);
  assert.equal(scheduled.exam, null);
  const [created] = await eventsOf(entryId);
  assert.deepEqual(created.after, {
    kind: MedicalEntryKind.EXAM,
    status: MedicalEntryStatus.SCHEDULED,
    examType: ExamType.VET,
    dueDate: "2026-10-14",
    notes: null,
  });

  await prisma.$transaction((tx) =>
    rescheduleMedicalEntry(tx, entryId, day("2026-10-12"), editorId, TODAY),
  );
  // Recorded as the recheck it turned out to be.
  await recordScheduled(
    entryId,
    exam({ examType: ExamType.RECHECK, completedDate: day("2026-10-09") }),
  );
  const given = await entryOf(entryId);
  assert.equal(given.status, MedicalEntryStatus.COMPLETED);
  assert.equal(given.examType, ExamType.RECHECK);
  assert.equal(given.dueDate, "2026-10-12");
  // Recorded by the editor, in house.
  assert.equal(given.administeredById, editorId);
  assert.equal(given.exam?.overallResult, ExamResult.NO_CONCERNS);
  assert.equal((await findingsOf(entryId)).length, 12);
  const completed = (await eventsOf(entryId)).at(-1);
  assert.equal(completed?.action, MedicalEntryEventAction.COMPLETED);
  assert.deepEqual(completed?.before, { status: MedicalEntryStatus.SCHEDULED });
  assert.equal((completed?.after as Record<string, unknown>).examType, ExamType.RECHECK);

  assert.deepEqual(await summariesOf(animalId), [
    "Vet exam scheduled for Oct 14, 2026.",
    "Vet exam rescheduled from Oct 14, 2026 to Oct 12, 2026.",
    "Recheck exam recorded: done in house, on Oct 9, 2026 (due Oct 12, 2026). Result: no concerns.",
  ]);
});

test("recording a scheduled exam as an intake exam runs the intake-day rule", async () => {
  const animalId = await makeAnimal("Scheduled returned", [INTAKE_DAY, day("2026-09-15")]);
  const { entryId } = await schedule(animalId, ExamType.VET);
  await refusedOn(
    recordScheduled(entryId, exam({ completedDate: day("2026-09-10") })),
    "completedDate",
    /latest intake, on Sep 15, 2026/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
});

test("a scheduled exam is declined with a reason, and never schedules a next one", async () => {
  const animalId = await makeAnimal("Declined");
  const { entryId } = await schedule(animalId, ExamType.PRE_ADOPTION);
  await prisma.$transaction((tx) =>
    declineMedicalEntry(tx, entryId, "Adoption fell through.", editorId),
  );
  const declined = await entryOf(entryId);
  assert.equal(declined.status, MedicalEntryStatus.DECLINED);
  assert.equal(declined.declineReason, "Adoption fell through.");
  assert.equal(declined.examType, ExamType.PRE_ADOPTION);
  assert.deepEqual(await summariesOf(animalId), [
    "Pre-adoption exam scheduled for Oct 14, 2026.",
    "Pre-adoption exam due Oct 14, 2026 was declined. Reason: Adoption fell through.",
  ]);

  const next = { dueDate: day("2026-11-01") };
  const other = await makeAnimal("No next");
  await refusedOn(
    record(other, { ...exam(), scheduleNext: next }),
    "scheduleNext",
    /Only a catalog item can repeat/,
  );
  await assertNothingWritten(other);
  const recheck = await schedule(other, ExamType.RECHECK);
  await refusedOn(
    recordScheduled(recheck.entryId, {
      ...exam({ examType: ExamType.RECHECK }),
      scheduleNext: next,
    }),
    "scheduleNext",
    /Only a catalog item can repeat/,
  );
  assert.equal((await entryOf(recheck.entryId)).status, MedicalEntryStatus.SCHEDULED);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: other } }), 1);
});

test("a correction changes the result or one system's finding, and keeps the reproductive status left out", async () => {
  const animalId = await makeAnimal("Corrected");
  const { entryId } = await record(
    animalId,
    exam({
      examType: ExamType.RECHECK,
      overallResult: ExamResult.NEEDS_VET_REVIEW,
      reproductiveStatus: ReproductiveStatus.INTACT,
    }),
  );

  const rowsBefore = await findingsOf(entryId);
  const result = await edit(entryId, exam({ examType: ExamType.RECHECK }));
  assert.equal(result.status, "edited");
  // Only the result changed, so the finding rows are left as they were.
  assert.deepEqual(await findingsOf(entryId), rowsBefore);
  assert.equal(
    result.status === "edited" && result.changeSummary,
    "Recheck exam was corrected: the result changed from needs vet review to no concerns.",
  );
  // Left out, the reproductive status stays as stored.
  assert.equal((await entryOf(entryId)).exam?.reproductiveStatus, ReproductiveStatus.INTACT);
  const resultEvent = (await eventsOf(entryId)).at(-1);
  assert.deepEqual(resultEvent?.before, { overallResult: ExamResult.NEEDS_VET_REVIEW });
  assert.deepEqual(resultEvent?.after, { overallResult: ExamResult.NO_CONCERNS });

  // One system's finding changes; the text names only that system.
  const heart = await edit(
    entryId,
    exam({
      examType: ExamType.RECHECK,
      findings: findings({ HEART: { status: ABNORMAL, notes: "Innocent murmur." } }),
    }),
  );
  assert.equal(
    heart.status === "edited" && heart.changeSummary,
    "Recheck exam was corrected: the findings changed (heart: normal to abnormal).",
  );
  // The event holds the whole list on each side, as a test's results are.
  const findingsEvent = (await eventsOf(entryId)).at(-1);
  assert.equal(findingsEvent?.action, MedicalEntryEventAction.EDITED);
  assert.deepEqual(findingsEvent?.before, { examFindings: findings() });
  assert.deepEqual(findingsEvent?.after, {
    examFindings: findings({ HEART: { status: ABNORMAL, notes: "Innocent murmur." } }),
  });
  const storedHeart = (await findingsOf(entryId)).find((row) => row.bodySystem === "HEART");
  assert.equal(storedHeart?.status, ABNORMAL);
  assert.equal(storedHeart?.notes, "Innocent murmur.");
  const note = await edit(
    entryId,
    exam({
      examType: ExamType.RECHECK,
      findings: findings({
        HEART: { status: ABNORMAL, notes: "Innocent murmur; no treatment needed." },
        EARS: { status: NORMAL, notes: "Clean." },
      }),
    }),
  );
  assert.equal(
    note.status === "edited" && note.changeSummary,
    "Recheck exam was corrected: the findings changed (ears: note added; heart: note edited).",
  );

  // Cleared on purpose, it is cleared.
  const cleared = await edit(
    entryId,
    exam({
      examType: ExamType.RECHECK,
      reproductiveStatus: null,
      findings: findings({
        HEART: { status: ABNORMAL, notes: "Innocent murmur; no treatment needed." },
        EARS: { status: NORMAL, notes: "Clean." },
      }),
    }),
  );
  assert.equal(
    cleared.status === "edited" && cleared.changeSummary,
    "Recheck exam was corrected: the reproductive status was cleared (was intact).",
  );
  assert.equal((await entryOf(entryId)).exam?.reproductiveStatus, null);
});

test("a save that changes nothing writes nothing", async () => {
  const animalId = await makeAnimal("Unchanged");
  const input = exam({
    findings: findings({ HEART: { status: ABNORMAL, notes: "Murmur." } }),
  });
  const { entryId } = await record(animalId, input);
  const entryBefore = await entryOf(entryId);
  const findingsBefore = await findingsOf(entryId);
  const eventsBefore = (await eventsOf(entryId)).length;
  const activityBefore = (await activityOf(animalId)).length;

  // The same exam, its notes typed with spaces and its rows in another order.
  const unchanged = await edit(
    entryId,
    exam({
      findings: findings({ HEART: { status: ABNORMAL, notes: " Murmur. " } }).reverse(),
    }),
  );
  assert.equal(unchanged.status, "unchanged");
  const entryAfter = await entryOf(entryId);
  assert.deepEqual(entryAfter.updatedAt, entryBefore.updatedAt);
  assert.deepEqual(entryAfter.exam?.updatedAt, entryBefore.exam?.updatedAt);
  assert.deepEqual(await findingsOf(entryId), findingsBefore);
  assert.equal((await eventsOf(entryId)).length, eventsBefore);
  assert.equal((await activityOf(animalId)).length, activityBefore);
});

test("changing an exam's type or day to an intake exam before the latest intake is refused", async () => {
  const animalId = await makeAnimal("Type corrected", [INTAKE_DAY, day("2026-09-15")]);
  const { entryId } = await record(
    animalId,
    exam({ examType: ExamType.VET, completedDate: day("2026-09-10") }),
  );
  await refusedOn(
    edit(entryId, exam({ completedDate: day("2026-09-10") })),
    "completedDate",
    /latest intake, on Sep 15, 2026/,
  );
  const intake = await record(animalId, exam({ completedDate: day("2026-09-20") }));
  await refusedOn(
    edit(intake.entryId, exam({ completedDate: day("2026-09-12") })),
    "completedDate",
    /latest intake, on Sep 15, 2026/,
  );
  assert.equal((await entryOf(entryId)).examType, ExamType.VET);
  assert.equal((await entryOf(intake.entryId)).completedDate, "2026-09-20");

  // Corrected to a day in the stay, it's taken.
  const moved = await edit(intake.entryId, exam({ completedDate: day("2026-09-16") }));
  assert.equal(
    moved.status === "edited" && moved.changeSummary,
    "Intake exam was corrected: the date given changed from Sep 20, 2026 to Sep 16, 2026.",
  );
  const retyped = await edit(
    entryId,
    exam({ examType: ExamType.RECHECK, completedDate: day("2026-09-10") }),
  );
  assert.equal(
    retyped.status === "edited" && retyped.changeSummary,
    "Recheck exam was corrected: the exam type changed from vet exam to recheck exam.",
  );
});

test("a correction is held to the systems the exam was recorded with", async () => {
  const animalId = await makeAnimal("Older exam");
  const { entryId } = await record(animalId, exam());
  // As if the exam had been recorded before Neurological was listed.
  await prisma.examFinding.deleteMany({
    where: { examDetails: { entryId }, bodySystem: "NEUROLOGICAL" },
  });
  const recorded = findings().filter((row) => row.bodySystem !== "NEUROLOGICAL");

  await refusedOn(
    edit(entryId, exam({ overallResult: ExamResult.NEEDS_TREATMENT })),
    "findings",
    /doesn't look at/,
  );
  const corrected = await edit(
    entryId,
    exam({ overallResult: ExamResult.NEEDS_TREATMENT, findings: recorded }),
  );
  assert.equal(corrected.status, "edited");
  assert.equal((await entryOf(entryId)).exam?.overallResult, ExamResult.NEEDS_TREATMENT);
  assert.equal((await findingsOf(entryId)).length, 11);
});

test("an exam is voided like any entry, and the activity names it", async () => {
  const animalId = await makeAnimal("Voided");
  const { entryId } = await record(animalId, exam());
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, entryId, "Recorded on the wrong animal.", editorId),
  );
  const entry = await entryOf(entryId);
  assert.ok(entry.voidedAt);
  assert.equal(entry.voidReason, "Recorded on the wrong animal.");
  assert.deepEqual(await summariesOf(animalId), [
    "Intake exam recorded: done in house, on Oct 3, 2026. Result: no concerns.",
    "Intake exam done on Oct 3, 2026 was voided. Reason: Recorded on the wrong animal.",
  ]);

  const scheduled = await schedule(animalId, ExamType.VET);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, scheduled.entryId, "Booked twice.", editorId),
  );
  assert.equal(
    (await summariesOf(animalId)).at(-1),
    "Vet exam due Oct 14, 2026 was voided. Reason: Booked twice.",
  );
});

test("history lists exams and filters to them; the vaccine reads leave them out", async () => {
  const animalId = await makeAnimal("History");
  const { entryId: rabiesEntryId } = await record(animalId, {
    kind: MedicalEntryKind.VACCINE,
    itemId: rabiesId,
    completedDate: day("2026-09-01"),
    source: MedicalEntrySource.IN_HOUSE,
    durationMonths: 12,
  });
  const { entryId: intakeId } = await record(animalId, exam());
  const { entryId: vetId } = await schedule(animalId, ExamType.VET);

  const page = (kinds: MedicalEntryKind[]) =>
    findMedicalHistoryPage(prisma, animalId, {
      kinds,
      page: 1,
      perPage: 10,
      timeZone: "UTC",
    });
  assert.deepEqual(
    (await page([])).entries.map((entry) => entry.id),
    [vetId, intakeId, rabiesEntryId],
  );
  assert.deepEqual(
    (await page([MedicalEntryKind.EXAM])).entries.map((entry) => [
      entry.id,
      entry.examType,
      entry.item,
    ]),
    [
      [vetId, ExamType.VET, null],
      [intakeId, ExamType.INTAKE, null],
    ],
  );

  assert.equal((await findLatestRabiesVaccine(prisma, animalId))?.entryId, rabiesEntryId);
  assert.deepEqual(
    (await findVaccinesAndTests(prisma, animalId)).map((entry) => entry.id),
    [rabiesEntryId],
  );
  // Recent entries are every completed entry, the exam among them.
  assert.deepEqual(
    (await findRecentMedicalEntries(prisma, animalId, 5)).map((entry) => entry.id),
    [intakeId, rabiesEntryId],
  );
});

test("exams aren't recorded or scheduled in a batch", async () => {
  const animalId = await makeAnimal("Batch");
  const batch = (input: MedicalBatchInput) =>
    prisma.$transaction((tx) => recordMedicalBatch(tx, input, staffId, TODAY));

  await refusedOn(
    batch({
      mode: "RECORD",
      animals: [{ animalId }],
      entry: exam() as unknown as Extract<MedicalBatchInput, { mode: "RECORD" }>["entry"],
    }),
    "kind",
    /^Only vaccines and treatments are recorded in a batch/,
  );
  await refusedOn(
    batch({
      mode: "SCHEDULE",
      animals: [{ animalId }],
      entry: {
        kind: MedicalEntryKind.EXAM,
        examType: ExamType.VET,
        dueDate: day("2026-10-14"),
      } as unknown as Extract<MedicalBatchInput, { mode: "SCHEDULE" }>["entry"],
    }),
    "kind",
    /^Only vaccines and treatments are recorded in a batch/,
  );
  await assertNothingWritten(animalId);

  // A scheduled exam can't be recorded with others as given.
  const { entryId } = await schedule(animalId, ExamType.VET);
  await refusedOn(
    prisma.$transaction((tx) =>
      recordScheduledMedicalBatch(
        tx,
        {
          entries: [{ entryId }],
          details: {
            kind: MedicalEntryKind.TREATMENT,
            completedDate: day("2026-10-09"),
            source: MedicalEntrySource.IN_HOUSE,
          },
        },
        staffId,
        TODAY,
      ),
    ),
    "entries",
    /exams aren't recorded in a batch/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
});

// ---------------------------------------------------------------------------
// Vitals measured during an exam
// ---------------------------------------------------------------------------

const MEASURED_AT = new Date("2026-10-03T16:30:00Z");

const vitalsOf = (animalId: string) =>
  prisma.vitalsLog.findMany({ where: { animalId }, orderBy: { createdAt: "asc" } });

const feedOf = async (animalId: string) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }],
      select: { activityType: true, changeSummary: true },
    })
  ).map((row) => `${row.activityType}: ${row.changeSummary}`);

test("an exam with vitals writes one vitals entry, links it, and logs it after the exam", async () => {
  const animalId = await makeAnimal("With vitals");
  const { entryId } = await record(
    animalId,
    {
      ...exam(),
      vitals: {
        recordedAt: MEASURED_AT,
        weightGrams: 12400,
        temperatureC: 38.6,
        bodyConditionScore: 5,
      },
    },
  );

  const [log] = await vitalsOf(animalId);
  assert.equal((await vitalsOf(animalId)).length, 1);
  assert.equal(log.recordedAt.toISOString(), MEASURED_AT.toISOString());
  assert.equal(log.recordedById, staffId);
  assert.equal(log.weightGrams, 12400);
  assert.equal(log.temperatureC, 38.6);
  assert.equal(log.bodyConditionScore, 5);
  assert.equal((await entryOf(entryId)).exam?.vitalsLogId, log.id);
  assert.equal(
    (await prisma.animal.findUniqueOrThrow({ where: { id: animalId } })).currentWeightGrams,
    12400,
  );

  const [created] = await eventsOf(entryId);
  assert.equal((created.after as { vitalsLogId?: string }).vitalsLogId, log.id);

  assert.deepEqual(await feedOf(animalId), [
    `${AnimalActivityType.MEDICAL_ENTRY_RECORDED}: Intake exam recorded: done in house, on Oct 3, 2026. Result: no concerns.`,
    `${AnimalActivityType.VITALS_RECORDED}: Weight recorded: 12.4 kg`,
  ]);

  // Another exam with none writes no vitals entry, and its event names none.
  const { entryId: second } = await record(
    animalId,
    exam({ examType: ExamType.VET, completedDate: day("2026-10-05") }),
  );
  assert.equal((await vitalsOf(animalId)).length, 1);
  assert.equal((await entryOf(second)).exam?.vitalsLogId, null);
  const [secondCreated] = await eventsOf(second);
  assert.equal("vitalsLogId" in (secondCreated.after as object), false);
});

test("recording a scheduled exam can bring its vitals too", async () => {
  const animalId = await makeAnimal("Scheduled vitals");
  const { entryId } = await schedule(animalId, ExamType.RECHECK, day("2026-10-12"));
  await recordScheduled(entryId, {
    ...exam({ examType: ExamType.RECHECK, completedDate: TODAY }),
    vitals: { recordedAt: MEASURED_AT, temperatureC: 38.9 },
  });

  const [log] = await vitalsOf(animalId);
  assert.equal(log.recordedById, editorId);
  assert.equal(log.weightGrams, null);
  assert.equal((await entryOf(entryId)).exam?.vitalsLogId, log.id);
  const completed = (await eventsOf(entryId)).find(
    (event) => event.action === MedicalEntryEventAction.COMPLETED,
  );
  assert.equal((completed?.after as { vitalsLogId?: string }).vitalsLogId, log.id);
  assert.equal((await feedOf(animalId)).at(-1), `${AnimalActivityType.VITALS_RECORDED}: Vitals recorded.`);
});

test("vitals out of bounds or with no measurement refuse the whole exam, and other kinds can't bring them", async () => {
  const animalId = await makeAnimal("Bad vitals");
  await refusedOn(
    record(animalId, { ...exam(), vitals: { recordedAt: MEASURED_AT, temperatureC: 50 } }),
    "vitals.temperatureC",
    /at most 45/,
  );
  await refusedOn(
    record(animalId, { ...exam(), vitals: { recordedAt: MEASURED_AT } }),
    "vitals.weightGrams",
    /at least one measurement/,
  );
  await refusedOn(
    record(animalId, {
      kind: MedicalEntryKind.VACCINE,
      itemId: rabiesId,
      durationMonths: 12,
      completedDate: day("2026-10-03"),
      source: MedicalEntrySource.IN_HOUSE,
      vitals: { recordedAt: MEASURED_AT, weightGrams: 5000 },
    }),
    "vitals",
    /Only an exam records vitals/,
  );
  await assertNothingWritten(animalId);
  assert.equal((await vitalsOf(animalId)).length, 0);
});

test("correcting an exam leaves its vitals entry alone, and a deleted one still reads through the link", async () => {
  const animalId = await makeAnimal("Vitals kept");
  const { entryId } = await record(animalId, {
    ...exam(),
    vitals: { recordedAt: MEASURED_AT, weightGrams: 8000 },
  });
  const [log] = await vitalsOf(animalId);

  const edited = await edit(entryId, exam({ overallResult: ExamResult.NEEDS_TREATMENT }));
  assert.equal(edited.status, "edited");
  const [after] = await vitalsOf(animalId);
  assert.deepEqual(after, log);
  assert.equal((await entryOf(entryId)).exam?.vitalsLogId, log.id);
  const [, editedEvent] = await eventsOf(entryId);
  assert.deepEqual(Object.keys(editedEvent.after as object), ["overallResult"]);

  // Deleted on the Vitals page: soft-deleted, so the exam still reaches it.
  const deletedAt = new Date("2026-10-08T12:00:00Z");
  await prisma.vitalsLog.update({ where: { id: log.id }, data: { deletedAt } });
  const linked = await prisma.examDetails.findUniqueOrThrow({
    where: { entryId },
    select: { vitalsLog: { select: { id: true, weightGrams: true, deletedAt: true } } },
  });
  assert.deepEqual(linked.vitalsLog, { id: log.id, weightGrams: 8000, deletedAt });
});

// ---------------------------------------------------------------------------
// A spay or neuter found on an exam
// ---------------------------------------------------------------------------

const alteredExam = (overrides: Partial<ExamEntryInput> = {}) =>
  exam({
    examType: ExamType.VET,
    reproductiveStatus: ReproductiveStatus.ALTERED,
    ...overrides,
  });

const surgeriesOf = (animalId: string) =>
  prisma.medicalEntry.findMany({
    where: { animalId, kind: MedicalEntryKind.SURGERY },
    include: { surgery: true },
  });

test("an exam reading altered records the neuter it found, linked to it, after the exam and its vitals", async () => {
  const animalId = await makeAnimal("Found neuter", [INTAKE_DAY], Sex.MALE);
  const { entryId } = await record(animalId, {
    ...alteredExam(),
    vitals: { recordedAt: MEASURED_AT, weightGrams: 21000 },
    foundAltered: { procedure: SurgeryProcedure.NEUTER },
  });

  const [surgery] = await surgeriesOf(animalId);
  assert.equal((await surgeriesOf(animalId)).length, 1);
  assert.equal(surgery.status, MedicalEntryStatus.COMPLETED);
  assert.equal(surgery.procedure, SurgeryProcedure.NEUTER);
  assert.equal(surgery.source, MedicalEntrySource.BEFORE_INTAKE);
  assert.equal(surgery.completedDate, null);
  assert.equal(surgery.createdById, staffId);
  assert.equal(surgery.surgery?.evidence, SurgeryEvidence.FOUND_ON_EXAM);
  assert.equal(surgery.surgery?.foundOnExamId, entryId);

  const [examCreated] = await eventsOf(entryId);
  assert.equal(examCreated.action, MedicalEntryEventAction.CREATED);
  assert.equal((examCreated.after as { reproductiveStatus: string }).reproductiveStatus, "ALTERED");
  const [surgeryCreated] = await eventsOf(surgery.id);
  assert.equal(surgeryCreated.action, MedicalEntryEventAction.CREATED);
  assert.deepEqual(surgeryCreated.after, {
    kind: MedicalEntryKind.SURGERY,
    status: MedicalEntryStatus.COMPLETED,
    itemId: null,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    vetPartnerId: null,
    vetName: null,
    administeredById: null,
    notes: null,
    procedure: SurgeryProcedure.NEUTER,
    surgeon: null,
    findings: null,
    anesthesiaNotes: null,
    evidence: SurgeryEvidence.FOUND_ON_EXAM,
    foundOnExamId: entryId,
  });

  assert.deepEqual(await feedOf(animalId), [
    `${AnimalActivityType.MEDICAL_ENTRY_RECORDED}: Vet exam recorded: done in house, on Oct 3, 2026. Result: no concerns.`,
    `${AnimalActivityType.VITALS_RECORDED}: Weight recorded: 21 kg`,
    `${AnimalActivityType.MEDICAL_ENTRY_RECORDED}: Neuter surgery recorded: done before intake, on an unknown date. Evidence: found on the vet exam of Oct 3, 2026.`,
  ]);

  const status = await findMedicalStatus(prisma, animalId, TODAY);
  assert.equal(status.spayNeuter.status, "ALTERED");
  assert.equal(
    status.spayNeuter.status === "ALTERED" && status.spayNeuter.entryId,
    surgery.id,
  );
});

test("recording a scheduled exam can record the spay it found too", async () => {
  const animalId = await makeAnimal("Found spay");
  const { entryId } = await schedule(animalId, ExamType.INTAKE);
  await recordScheduled(entryId, {
    ...alteredExam({ examType: ExamType.INTAKE, completedDate: day("2026-10-09") }),
    foundAltered: { procedure: SurgeryProcedure.SPAY },
  });
  const [surgery] = await surgeriesOf(animalId);
  assert.equal(surgery.procedure, SurgeryProcedure.SPAY);
  assert.equal(surgery.createdById, editorId);
  assert.equal(surgery.surgery?.foundOnExamId, entryId);
  assert.equal(
    (await summariesOf(animalId)).at(-1),
    "Spay surgery recorded: done before intake, on an unknown date. Evidence: found on the intake exam of Oct 9, 2026.",
  );
});

test("a found spay or neuter is refused unless the exam reads altered, the animal isn't already, and its sex allows it", async () => {
  const female = await makeAnimal("Found refused");
  await refusedOn(
    record(female, {
      ...alteredExam({ reproductiveStatus: ReproductiveStatus.UNDETERMINED }),
      foundAltered: { procedure: SurgeryProcedure.SPAY },
    }),
    "foundAltered",
    /only when the exam found the animal altered/,
  );
  await refusedOn(
    record(female, {
      ...alteredExam(),
      foundAltered: { procedure: SurgeryProcedure.NEUTER },
    }),
    "foundAltered.procedure",
    /A neuter is for a male/,
  );
  await refusedOn(
    record(female, {
      ...alteredExam(),
      foundAltered: { procedure: SurgeryProcedure.DENTAL },
    }),
    "foundAltered.procedure",
    /Pick spay or neuter/,
  );
  await refusedOn(
    record(female, {
      kind: MedicalEntryKind.VACCINE,
      itemId: rabiesId,
      durationMonths: 12,
      completedDate: day("2026-10-03"),
      source: MedicalEntrySource.IN_HOUSE,
      foundAltered: { procedure: SurgeryProcedure.SPAY },
    }),
    "foundAltered",
    /Only an exam/,
  );
  await assertNothingWritten(female);

  // Already spayed on its record: the exam alone is recorded, or nothing.
  const spayed = await makeAnimal("Already spayed");
  await record(spayed, {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.SPAY,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.SCAR,
  });
  await refusedOn(
    record(spayed, { ...alteredExam(), foundAltered: { procedure: SurgeryProcedure.SPAY } }),
    "foundAltered",
    /already spayed or neutered on its record/,
  );
  assert.equal(
    await prisma.medicalEntry.count({ where: { animalId: spayed, kind: MedicalEntryKind.EXAM } }),
    0,
  );
  assert.equal((await surgeriesOf(spayed)).length, 1);
});

test("found on an exam isn't evidence a plain surgery record or correction can give", async () => {
  const animalId = await makeAnimal("Plain surgery");
  const foundOnExam = {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.SPAY,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.FOUND_ON_EXAM,
  } as const;
  await refusedOn(
    record(animalId, foundOnExam),
    "evidence",
    /A spay or neuter found on an exam is recorded from that exam/,
  );
  await assertNothingWritten(animalId);

  const { entryId } = await record(animalId, { ...foundOnExam, evidence: SurgeryEvidence.SCAR });
  await refusedOn(
    edit(entryId, foundOnExam),
    "evidence",
    /recorded from that exam/,
  );
  assert.equal((await surgeriesOf(animalId))[0].surgery?.evidence, SurgeryEvidence.SCAR);
});

test("a surgery found on an exam keeps how it was found, its other fields can be corrected, and voiding the exam leaves it", async () => {
  const animalId = await makeAnimal("Linked surgery", [INTAKE_DAY], Sex.MALE);
  const { entryId: examId } = await record(animalId, {
    ...alteredExam(),
    foundAltered: { procedure: SurgeryProcedure.NEUTER },
  });
  const [surgery] = await surgeriesOf(animalId);
  const linked = {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.NEUTER,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.FOUND_ON_EXAM,
  } as const;

  const notes = await edit(surgery.id, { ...linked, notes: "Scar along the midline." });
  assert.equal(notes.status, "edited");
  const corrected = (await surgeriesOf(animalId))[0];
  assert.equal(corrected.notes, "Scar along the midline.");
  assert.equal(corrected.surgery?.foundOnExamId, examId);
  assert.equal(corrected.surgery?.evidence, SurgeryEvidence.FOUND_ON_EXAM);

  await refusedOn(
    edit(surgery.id, { ...linked, evidence: SurgeryEvidence.SCAR }),
    "evidence",
    /This neuter was found on an exam\. Void it and record it again/,
  );
  await refusedOn(
    edit(surgery.id, {
      ...linked,
      source: MedicalEntrySource.OUTSIDE_VET,
      completedDate: day("2026-10-03"),
      evidence: null,
    }),
    "evidence",
    /found on an exam/,
  );

  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, examId, "Recorded on the wrong animal.", editorId),
  );
  const afterVoid = (await surgeriesOf(animalId))[0];
  assert.equal(afterVoid.voidedAt, null);
  assert.equal(afterVoid.surgery?.foundOnExamId, examId);
  assert.equal(
    (await findMedicalStatus(prisma, animalId, TODAY)).spayNeuter.status,
    "ALTERED",
  );
});
