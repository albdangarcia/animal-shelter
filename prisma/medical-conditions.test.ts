// The problem list, against a real Postgres: conditions and allergies added,
// corrected, resolved, made active again and voided through the condition
// service, as the actions drive it. A condition may name the test or exam
// that found it and the medical characteristic it stands for; every change
// is kept as an event and a line in the animal's activity feed.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  CharacteristicCategory,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  IntakeType,
  MedicalConditionEventAction,
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalItemKind,
  CareEpisodeType,
  PartnerType,
  Sex,
  TestResult,
} from "@/prisma/generated/enums";
import {
  addCharacteristicFromCondition,
  addMedicalCondition,
  editMedicalCondition,
  voidMedicalCondition,
  type MedicalConditionCorrection,
  type MedicalConditionInput,
} from "@/app/lib/services/medical-condition";
import {
  MedicalEntryRefusal,
  recordMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
} from "@/app/lib/services/medical-entry";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import {
  closeCareEpisode,
  openCareEpisode,
  voidCareEpisode,
} from "@/app/lib/services/care-episode";
import {
  findCareEpisodes,
  findConditionEventNames,
  findConditionFormChoices,
  findProblemList,
} from "@/app/lib/data/animals/medical-condition";
import { findMedicalHistoryPage } from "@/app/lib/data/animals/medical-entry";
import {
  findAnimalReadiness,
  findReadinessForAnimals,
} from "@/app/lib/data/animals/readiness";
import { reconcileAnimalCharacteristics } from "@/app/lib/services/animal-characteristics";
import type { MedicalHistoryKind } from "@/app/lib/zod-schemas/medical-entry.schemas";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { EXAM_BODY_SYSTEM_KEYS } from "@/app/lib/constants/exam";
import { ConflictError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;
const { ACTIVE, CHRONIC, RESOLVED } = MedicalConditionStatus;
const { CONDITION, ALLERGY } = MedicalConditionType;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let heartwormTestId: string;
let antigenId: string;
let vaccineId: string;
let heartwormTraitId: string;
let deafTraitId: string;
let behaviourTraitId: string;
let retiredTraitId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Condition species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Condition color") },
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
  staffId = await person("Condition staff");
  editorId = await person("Condition editor");
  const item = (input: Parameters<typeof createMedicalItem>[1]) =>
    prisma.$transaction((tx) => createMedicalItem(tx, input));
  heartwormTestId = (
    await item({
      kind: MedicalItemKind.TEST,
      name: name("Heartworm antigen"),
      speciesIds: [],
      analytes: [{ name: "Heartworm" }],
    })
  ).id;
  antigenId = (
    await prisma.medicalItemAnalyte.findFirstOrThrow({
      where: { itemId: heartwormTestId },
      select: { id: true },
    })
  ).id;
  vaccineId = (
    await item({
      kind: MedicalItemKind.VACCINE,
      name: name("DHPP"),
      speciesIds: [],
      analytes: [],
    })
  ).id;
  const trait = async (
    label: string,
    category: CharacteristicCategory,
    deletedAt: Date | null = null,
  ) =>
    (
      await prisma.characteristic.create({
        data: { name: name(label), category, deletedAt },
        select: { id: true },
      })
    ).id;
  heartwormTraitId = await trait("Heartworm Positive", CharacteristicCategory.MEDICAL);
  deafTraitId = await trait("Deaf", CharacteristicCategory.MEDICAL);
  behaviourTraitId = await trait("Leash Reactive", CharacteristicCategory.BEHAVIOR);
  retiredTraitId = await trait(
    "Old Medical Trait",
    CharacteristicCategory.MEDICAL,
    new Date("2026-01-01T00:00:00Z"),
  );
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, conditions, their events and activity rows.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.characteristic.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.partner.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, intakeDays: CalendarDay[] = [INTAKE_DAY]) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
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

const archive = (animalId: string) =>
  prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

const condition = (
  overrides: Partial<MedicalConditionInput> = {},
): MedicalConditionInput => ({
  type: CONDITION,
  name: "Heartworm disease",
  status: ACTIVE,
  ...overrides,
});

const add = (
  animalId: string,
  input: MedicalConditionInput = condition(),
  options: { timeout?: number } = {},
) =>
  prisma.$transaction(
    (tx) => addMedicalCondition(tx, { ...input, animalId }, staffId, TODAY),
    options,
  );

const edit = (conditionId: string, input: MedicalConditionCorrection) =>
  prisma.$transaction((tx) =>
    editMedicalCondition(tx, conditionId, input, editorId, TODAY),
  );

const voidIt = (conditionId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicalCondition(tx, conditionId, reason, editorId));

const recordHeartwormTest = async (
  animalId: string,
  completedDate: CalendarDay = day("2026-09-03"),
) =>
  (
    await prisma.$transaction((tx) =>
      recordMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.TEST,
          itemId: heartwormTestId,
          completedDate,
          source: MedicalEntrySource.IN_HOUSE,
          results: [{ analyteId: antigenId, result: TestResult.POSITIVE }],
        },
        staffId,
        TODAY,
      ),
    )
  ).entryId;

const recordIntakeExam = async (animalId: string) =>
  (
    await prisma.$transaction((tx) =>
      recordMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.EXAM,
          examType: ExamType.INTAKE,
          overallResult: ExamResult.NEEDS_TREATMENT,
          completedDate: INTAKE_DAY,
          source: MedicalEntrySource.IN_HOUSE,
          findings: EXAM_BODY_SYSTEM_KEYS.map((bodySystem) => ({
            bodySystem,
            status: ExamFindingStatus.NORMAL,
            notes: null,
          })),
        },
        staffId,
        TODAY,
        { weightUnitSystem: "metric" },
      ),
    )
  ).entryId;

const stored = (conditionId: string) =>
  prisma.medicalCondition.findUniqueOrThrow({ where: { id: conditionId } });

const eventsOf = (conditionId: string) =>
  prisma.medicalConditionEvent.findMany({
    where: { conditionId },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true, before: true, after: true },
  });

const feedOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

/** Runs `write`, expecting it refused on `field` with nothing written. */
const assertRefused = async (
  animalId: string,
  write: () => Promise<unknown>,
  field: string | undefined,
  message?: RegExp,
) => {
  const conditionsBefore = await prisma.medicalCondition.count({ where: { animalId } });
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    if (message) assert.match(error.message, message);
    return true;
  });
  assert.equal(await prisma.medicalCondition.count({ where: { animalId } }), conditionsBefore);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

test("adds a condition and an allergy, each with its event and activity text", async () => {
  const animalId = await makeAnimal("Added");
  const testId = await recordHeartwormTest(animalId);

  const { conditionId } = await add(
    animalId,
    condition({
      name: "  Heartworm disease ",
      onsetDate: day("2026-09-03"),
      diagnosedBy: " Dr. Patel ",
      sourceEntryId: testId,
      characteristicId: heartwormTraitId,
      notes: " Start adulticide after rest. ",
    }),
  );
  const row = await stored(conditionId);
  assert.deepEqual(
    {
      animalId: row.animalId,
      type: row.type,
      name: row.name,
      status: row.status,
      onsetDate: row.onsetDate,
      resolvedDate: row.resolvedDate,
      diagnosedBy: row.diagnosedBy,
      sourceEntryId: row.sourceEntryId,
      characteristicId: row.characteristicId,
      notes: row.notes,
      createdById: row.createdById,
      voidedAt: row.voidedAt,
    },
    {
      animalId,
      type: CONDITION,
      name: "Heartworm disease",
      status: ACTIVE,
      onsetDate: "2026-09-03",
      resolvedDate: null,
      diagnosedBy: "Dr. Patel",
      sourceEntryId: testId,
      characteristicId: heartwormTraitId,
      notes: "Start adulticide after rest.",
      createdById: staffId,
      voidedAt: null,
    },
  );
  assert.deepEqual(await eventsOf(conditionId), [
    {
      action: MedicalConditionEventAction.CREATED,
      actorId: staffId,
      before: null,
      after: {
        type: CONDITION,
        name: "Heartworm disease",
        status: ACTIVE,
        onsetDate: "2026-09-03",
        resolvedDate: null,
        diagnosedBy: "Dr. Patel",
        sourceEntryId: testId,
        characteristicId: heartwormTraitId,
        notes: "Start adulticide after rest.",
      },
    },
  ]);

  const { conditionId: allergyId } = await add(
    animalId,
    condition({ type: ALLERGY, name: "Penicillin" }),
  );
  assert.equal((await stored(allergyId)).type, ALLERGY);

  const feed = (await feedOf(animalId)).filter(
    (row) => row.activityType === AnimalActivityType.MEDICAL_CONDITION_ADDED,
  );
  assert.deepEqual(feed, [
    {
      activityType: AnimalActivityType.MEDICAL_CONDITION_ADDED,
      changedById: staffId,
      changeSummary: `Condition added: Heartworm disease (active, onset Sep 3, 2026). Found on the ${name("Heartworm antigen")} test of Sep 3, 2026.`,
    },
    {
      activityType: AnimalActivityType.MEDICAL_CONDITION_ADDED,
      changedById: staffId,
      changeSummary: "Allergy added: Penicillin.",
    },
  ]);
});

test("a resolved condition is added with its day, and a chronic allergy says so", async () => {
  const animalId = await makeAnimal("Added resolved");
  const examId = await recordIntakeExam(animalId);
  const { conditionId } = await add(
    animalId,
    condition({
      name: "Flea infestation",
      status: RESOLVED,
      onsetDate: INTAKE_DAY,
      resolvedDate: day("2026-08-15"),
      sourceEntryId: examId,
    }),
  );
  assert.equal((await stored(conditionId)).resolvedDate, "2026-08-15");
  await add(animalId, condition({ type: ALLERGY, name: "Chicken", status: CHRONIC }));

  const texts = (await feedOf(animalId))
    .filter((row) => row.activityType === AnimalActivityType.MEDICAL_CONDITION_ADDED)
    .map((row) => row.changeSummary);
  assert.deepEqual(texts, [
    "Condition added: Flea infestation (resolved, onset Aug 1, 2026, resolved Aug 15, 2026). Found on the intake exam of Aug 1, 2026.",
    "Allergy added: Chicken (chronic).",
  ]);
});

test("the source is a completed, live test or exam of the same animal", async () => {
  const animalId = await makeAnimal("Sources");
  const otherId = await makeAnimal("Sources other");
  const otherTestId = await recordHeartwormTest(otherId);
  const voidedTestId = await recordHeartwormTest(animalId);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, voidedTestId, "Wrong animal.", staffId),
  );
  const { entryId: scheduledTestId } = await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.TEST, itemId: heartwormTestId, dueDate: TODAY },
      staffId,
      TODAY,
    ),
  );
  const { entryId: vaccineEntryId } = await prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.VACCINE,
        itemId: vaccineId,
        completedDate: day("2026-09-01"),
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      TODAY,
    ),
  );

  for (const [sourceEntryId, message] of [
    [otherTestId, /isn't on this animal's record/],
    ["missing-entry-id", /isn't on this animal's record/],
    [scheduledTestId, /hasn't been recorded as done/],
    [voidedTestId, /was voided/],
    [vaccineEntryId, /found on a test or an exam/],
  ] as const) {
    await assertRefused(
      animalId,
      () => add(animalId, condition({ sourceEntryId })),
      "sourceEntryId",
      message,
    );
  }

  // An exam, and a test, of its own are accepted.
  const examId = await recordIntakeExam(animalId);
  const testId = await recordHeartwormTest(animalId);
  await add(animalId, condition({ name: "Otitis", sourceEntryId: examId }));
  await add(animalId, condition({ sourceEntryId: testId }));
});

test("the trait is a medical characteristic still in use", async () => {
  const animalId = await makeAnimal("Traits");
  await assertRefused(
    animalId,
    () => add(animalId, condition({ characteristicId: behaviourTraitId })),
    "characteristicId",
    /Pick a medical characteristic/,
  );
  await assertRefused(
    animalId,
    () => add(animalId, condition({ characteristicId: retiredTraitId })),
    "characteristicId",
    /retired/,
  );
  const { conditionId } = await add(
    animalId,
    condition({ name: "Congenital deafness", status: CHRONIC, characteristicId: deafTraitId }),
  );
  assert.equal((await stored(conditionId)).characteristicId, deafTraitId);
});

test("the name is required, at most 120 characters, and not listed twice for one type", async () => {
  const animalId = await makeAnimal("Names");
  await assertRefused(animalId, () => add(animalId, condition({ name: "   " })), "name", /required/);
  await assertRefused(
    animalId,
    () => add(animalId, condition({ name: "x".repeat(121) })),
    "name",
    /120 characters/,
  );
  await add(animalId, condition({ name: "x".repeat(120) }));

  await add(animalId, condition({ name: "Heartworm disease" }));
  await assertRefused(
    animalId,
    () => add(animalId, condition({ name: " HEARTWORM DISEASE " })),
    "name",
    /^Heartworm disease is already on the problem list\.$/,
  );
  // The same name as an allergy is another row.
  await add(animalId, condition({ type: ALLERGY, name: "Heartworm disease" }));

  // A resolved row is still listed: it is made active again instead.
  await add(
    animalId,
    condition({ name: "Kennel cough", status: RESOLVED, resolvedDate: day("2026-09-01") }),
  );
  await assertRefused(
    animalId,
    () => add(animalId, condition({ name: "kennel cough" })),
    "name",
    /already on the problem list\. Make it active again instead\./,
  );

  // A voided row isn't.
  const { conditionId } = await add(animalId, condition({ name: "Mange" }));
  await voidIt(conditionId, "Wrong animal.");
  await add(animalId, condition({ name: "Mange" }));
});

test("the day rules: no future days, a resolved day only when resolved, and in order", async () => {
  const animalId = await makeAnimal("Days");
  await assertRefused(
    animalId,
    () => add(animalId, condition({ onsetDate: day("2026-10-11") })),
    "onsetDate",
    /^The onset date can't be in the future\.$/,
  );
  await assertRefused(
    animalId,
    () => add(animalId, condition({ status: RESOLVED })),
    "resolvedDate",
    /Give the day it resolved/,
  );
  await assertRefused(
    animalId,
    () => add(animalId, condition({ status: ACTIVE, resolvedDate: day("2026-09-01") })),
    "resolvedDate",
    /Only a resolved condition/,
  );
  await assertRefused(
    animalId,
    () =>
      add(
        animalId,
        condition({ status: RESOLVED, resolvedDate: day("2026-10-11") }),
      ),
    "resolvedDate",
    /^The resolved date can't be in the future\.$/,
  );
  await assertRefused(
    animalId,
    () =>
      add(
        animalId,
        condition({
          status: RESOLVED,
          onsetDate: day("2026-09-10"),
          resolvedDate: day("2026-09-09"),
        }),
      ),
    "resolvedDate",
    /before the onset date/,
  );
  await assertRefused(
    animalId,
    () =>
      add(
        animalId,
        condition({ status: RESOLVED, resolvedDate: day("2026-07-31") }),
      ),
    "resolvedDate",
    /^The resolved date can't be before the animal's intake on Aug 1, 2026\.$/,
  );

  // An onset before intake is a condition the animal arrived with, and it may
  // resolve on its onset day.
  await add(
    animalId,
    condition({
      status: RESOLVED,
      onsetDate: day("2026-06-01"),
      resolvedDate: INTAKE_DAY,
    }),
  );
  await add(animalId, condition({ name: "Same day", onsetDate: TODAY, status: RESOLVED, resolvedDate: TODAY }));
});

// ---------------------------------------------------------------------------
// Correcting
// ---------------------------------------------------------------------------

test("resolving and then making a condition active again are corrections of its status", async () => {
  const animalId = await makeAnimal("Resolve");
  const { conditionId } = await add(
    animalId,
    condition({ onsetDate: day("2026-09-03") }),
  );

  const resolved = await edit(conditionId, {
    status: RESOLVED,
    resolvedDate: day("2026-10-08"),
  });
  assert.equal(resolved.status, "edited");
  assert.equal((await stored(conditionId)).resolvedDate, "2026-10-08");

  // Left out, the resolved day is cleared by a status that has none.
  const reactivated = await edit(conditionId, { status: ACTIVE });
  assert.equal(reactivated.status, "edited");
  const row = await stored(conditionId);
  assert.equal(row.status, ACTIVE);
  assert.equal(row.resolvedDate, null);

  // Chronic is made so again after resolving, with a note corrected at once.
  await edit(conditionId, { status: RESOLVED, resolvedDate: day("2026-10-09") });
  await edit(conditionId, { status: CHRONIC, notes: "Lifelong management." });

  assert.deepEqual(
    (await eventsOf(conditionId)).slice(1).map(({ action, actorId, before, after }) => ({
      action,
      actorId,
      before,
      after,
    })),
    [
      {
        action: MedicalConditionEventAction.EDITED,
        actorId: editorId,
        before: { status: ACTIVE, resolvedDate: null },
        after: { status: RESOLVED, resolvedDate: "2026-10-08" },
      },
      {
        action: MedicalConditionEventAction.EDITED,
        actorId: editorId,
        before: { status: RESOLVED, resolvedDate: "2026-10-08" },
        after: { status: ACTIVE, resolvedDate: null },
      },
      {
        action: MedicalConditionEventAction.EDITED,
        actorId: editorId,
        before: { status: ACTIVE, resolvedDate: null },
        after: { status: RESOLVED, resolvedDate: "2026-10-09" },
      },
      {
        action: MedicalConditionEventAction.EDITED,
        actorId: editorId,
        before: { status: RESOLVED, resolvedDate: "2026-10-09", notes: null },
        after: { status: CHRONIC, resolvedDate: null, notes: "Lifelong management." },
      },
    ],
  );
  const texts = (await feedOf(animalId))
    .filter((row) => row.activityType === AnimalActivityType.MEDICAL_CONDITION_EDITED)
    .map((row) => [row.changedById, row.changeSummary]);
  assert.deepEqual(texts, [
    [editorId, "Heartworm disease was resolved on Oct 8, 2026."],
    [editorId, "Heartworm disease was made active again."],
    [editorId, "Heartworm disease was resolved on Oct 9, 2026."],
    [
      editorId,
      "Heartworm disease was made chronic again. Also corrected: notes were added.",
    ],
  ]);

  // Making it active while giving a resolved day is refused.
  await assertRefused(
    animalId,
    () => edit(conditionId, { status: ACTIVE, resolvedDate: day("2026-10-09") }),
    "resolvedDate",
    /Only a resolved condition/,
  );
});

test("a correction keeps left-out fields, says what changed, and a no-op writes nothing", async () => {
  const animalId = await makeAnimal("Correct");
  const examId = await recordIntakeExam(animalId);
  const testId = await recordHeartwormTest(animalId);
  const { conditionId } = await add(
    animalId,
    condition({
      onsetDate: day("2026-09-03"),
      diagnosedBy: "Dr. Patel",
      sourceEntryId: examId,
      notes: "Mild.",
    }),
  );

  const corrected = await edit(conditionId, {
    name: "Heartworm infection",
    onsetDate: day("2026-09-02"),
    diagnosedBy: null,
    sourceEntryId: testId,
    characteristicId: heartwormTraitId,
  });
  assert.equal(corrected.status, "edited");
  const row = await stored(conditionId);
  assert.equal(row.type, CONDITION);
  assert.equal(row.status, ACTIVE);
  assert.equal(row.notes, "Mild.");
  assert.equal(row.diagnosedBy, null);
  assert.equal(
    corrected.status === "edited" && corrected.changeSummary,
    `Heartworm infection was corrected: the name changed from Heartworm disease to Heartworm infection, the onset date changed from Sep 3, 2026 to Sep 2, 2026, the person who diagnosed it was cleared (was Dr. Patel), the source changed from the intake exam of Aug 1, 2026 to the ${name("Heartworm antigen")} test of Sep 3, 2026 and the trait was set to ${name("Heartworm Positive")}.`,
  );
  const [, edited] = await eventsOf(conditionId);
  assert.deepEqual(edited.before, {
    name: "Heartworm disease",
    onsetDate: "2026-09-03",
    diagnosedBy: "Dr. Patel",
    sourceEntryId: examId,
    characteristicId: null,
  });

  // The same values again, with spaces around the text, change nothing.
  const updatedAt = row.updatedAt;
  const feedCount = (await feedOf(animalId)).length;
  const noOp = await edit(conditionId, {
    type: CONDITION,
    name: " Heartworm infection ",
    status: ACTIVE,
    onsetDate: day("2026-09-02"),
    resolvedDate: null,
    diagnosedBy: "  ",
    sourceEntryId: testId,
    characteristicId: heartwormTraitId,
    notes: " Mild. ",
  });
  assert.equal(noOp.status, "unchanged");
  assert.equal((await stored(conditionId)).updatedAt.getTime(), updatedAt.getTime());
  assert.equal((await eventsOf(conditionId)).length, 2);
  assert.equal((await feedOf(animalId)).length, feedCount);

  // A source voided since it was linked doesn't stop another correction, and
  // the link stays.
  await prisma.$transaction((tx) => voidMedicalEntry(tx, testId, "Lab mix-up.", staffId));
  await edit(conditionId, { notes: "Mild. Retest due." });
  assert.equal((await stored(conditionId)).sourceEntryId, testId);
  // But a voided source can't be linked anew.
  await edit(conditionId, { sourceEntryId: null });
  await assertRefused(
    animalId,
    () => edit(conditionId, { sourceEntryId: testId }),
    "sourceEntryId",
    /was voided/,
  );
});

test("renaming or retyping into a name already listed is refused", async () => {
  const animalId = await makeAnimal("Rename");
  await add(animalId, condition({ name: "Otitis" }));
  const { conditionId } = await add(animalId, condition({ type: ALLERGY, name: "otitis" }));
  await assertRefused(
    animalId,
    () => edit(conditionId, { type: CONDITION }),
    "name",
    /^Otitis is already on the problem list\.$/,
  );
  // A case-only rename of itself is fine.
  await edit(conditionId, { name: "Otitis" });
});

test("renaming into a name already listed for the same type is refused, and writes nothing", async () => {
  const animalId = await makeAnimal("Rename same type");
  await add(animalId, condition({ name: "Otitis" }));
  const { conditionId } = await add(animalId, condition({ name: "Mange" }));
  const rowBefore = await stored(conditionId);
  const eventsBefore = await eventsOf(conditionId);
  await assertRefused(
    animalId,
    () => edit(conditionId, { name: " OTITIS " }),
    "name",
    /^Otitis is already on the problem list\.$/,
  );
  assert.deepEqual(await stored(conditionId), rowBefore);
  assert.deepEqual(await eventsOf(conditionId), eventsBefore);
});

test("a name holding _, % or a backslash matches only itself", async () => {
  const animalId = await makeAnimal("Literal names");
  await add(animalId, condition({ name: "T4 low" }));
  await add(animalId, condition({ name: "100 blind" }));
  await add(animalId, condition({ name: "Ab" }));

  // Each would match an existing name if read as a pattern.
  await add(animalId, condition({ name: "T4_low" }));
  await add(animalId, condition({ name: "100% blind" }));
  await add(animalId, condition({ name: "A\\b" }));

  // Each is still refused against itself, in another case.
  for (const name of ["t4_LOW", "100% BLIND", "a\\B"]) {
    await assertRefused(
      animalId,
      () => add(animalId, condition({ name })),
      "name",
      /already on the problem list/,
    );
  }

  // The same holds for a rename.
  const { conditionId } = await add(animalId, condition({ name: "Mange" }));
  await edit(conditionId, { name: "T_ low" });
  await edit(conditionId, { name: "1%" });
  await assertRefused(
    animalId,
    () => edit(conditionId, { name: "t4_low" }),
    "name",
    /^T4_low is already on the problem list\.$/,
  );
});

// ---------------------------------------------------------------------------
// Voiding, and the animal leaving
// ---------------------------------------------------------------------------

test("a void is written once, with its text, and a voided row can't be corrected", async () => {
  const animalId = await makeAnimal("Void");
  const { conditionId } = await add(animalId, condition({ type: ALLERGY, name: "Penicillin" }));

  await assert.rejects(() => voidIt(conditionId, "   "), (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal);
    assert.equal(error.field, "reason");
    return true;
  });
  await voidIt(conditionId, "  Recorded on the wrong animal. ");
  const row = await stored(conditionId);
  assert.ok(row.voidedAt);
  assert.equal(row.voidedById, editorId);
  assert.equal(row.voidReason, "Recorded on the wrong animal.");
  assert.deepEqual((await eventsOf(conditionId)).at(-1), {
    action: MedicalConditionEventAction.VOIDED,
    actorId: editorId,
    before: null,
    after: { voidReason: "Recorded on the wrong animal." },
  });
  assert.deepEqual((await feedOf(animalId)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_CONDITION_VOIDED,
    changedById: editorId,
    changeSummary: "Allergy Penicillin was voided. Reason: Recorded on the wrong animal.",
  });

  await assert.rejects(() => voidIt(conditionId, "Again."), ConflictError);
  await assert.rejects(() => edit(conditionId, { notes: "Late note." }), ConflictError);
  assert.equal((await eventsOf(conditionId)).length, 2);
});

test("nothing is added for an animal that has left, but its rows are still resolved and voided", async () => {
  const animalId = await makeAnimal("Archived");
  const { conditionId } = await add(animalId, condition());
  const { conditionId: otherId } = await add(animalId, condition({ name: "Otitis" }));
  await archive(animalId);

  await assertRefused(
    animalId,
    () => add(animalId, condition({ name: "Mange" })),
    undefined,
    /left the shelter's care/,
  );
  await edit(conditionId, { status: RESOLVED, resolvedDate: TODAY });
  assert.equal((await stored(conditionId)).status, RESOLVED);
  await voidIt(otherId, "Wrong animal.");
});

// ---------------------------------------------------------------------------
// What the Conditions page reads
// ---------------------------------------------------------------------------

test("the Conditions page reads the problem list and episodes in order, with names for their changes", async () => {
  const animalId = await makeAnimal("Page");
  const testId = await recordHeartwormTest(animalId);
  const examId = await recordIntakeExam(animalId);
  const voidedTestId = await recordHeartwormTest(animalId, day("2026-09-10"));
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, voidedTestId, "Wrong animal.", staffId),
  );
  const clinicId = (
    await prisma.partner.create({
      data: { name: name("Page Clinic"), type: PartnerType.VET_CLINIC },
      select: { id: true },
    })
  ).id;

  const { conditionId: heartwormId } = await add(
    animalId,
    condition({ sourceEntryId: testId, characteristicId: heartwormTraitId }),
  );
  await edit(heartwormId, { characteristicId: deafTraitId });
  const { conditionId: fleasId } = await add(
    animalId,
    condition({ name: "flea infestation", sourceEntryId: examId }),
  );
  await edit(fleasId, { status: RESOLVED, resolvedDate: day("2026-08-20") });
  const { conditionId: ringwormId } = await add(animalId, condition({ name: "Ringworm" }));
  await voidIt(ringwormId, "Wrong animal.");
  const { conditionId: penicillinId } = await add(
    animalId,
    condition({ type: ALLERGY, name: "Penicillin" }),
  );
  const { conditionId: deafnessId } = await add(
    animalId,
    condition({ name: "Congenital deafness", status: CHRONIC }),
  );

  const run = <T>(write: (tx: TransactionClient) => Promise<T>) =>
    prisma.$transaction(write);
  const { episodeId: clinicStayId } = await run((tx) =>
    openCareEpisode(
      tx,
      {
        animalId,
        type: CareEpisodeType.HOSPITALISED_OFF_SITE,
        partnerId: clinicId,
        startDate: day("2026-08-03"),
        reason: "Dehydrated.",
      },
      staffId,
      TODAY,
    ),
  );
  await run((tx) => closeCareEpisode(tx, clinicStayId, day("2026-08-05"), editorId, TODAY));
  const { episodeId: voidedId } = await run((tx) =>
    openCareEpisode(
      tx,
      { animalId, type: CareEpisodeType.UNDER_VET_CARE, startDate: day("2026-09-01"), endDate: day("2026-09-02"), reason: "Wrong." },
      staffId,
      TODAY,
    ),
  );
  await run((tx) => voidCareEpisode(tx, voidedId, "Wrong animal.", editorId));
  const { episodeId: openId } = await run((tx) =>
    openCareEpisode(
      tx,
      {
        animalId,
        type: CareEpisodeType.HOSPITALISED_IN_HOUSE,
        startDate: day("2026-08-10"),
        reason: "Heartworm treatment.",
      },
      staffId,
      TODAY,
    ),
  );

  // Allergies, then live conditions, then resolved, then voided.
  const problems = await findProblemList(prisma, animalId);
  assert.deepEqual(
    problems.map((row) => row.id),
    [penicillinId, deafnessId, heartwormId, fleasId, ringwormId],
  );
  const heartworm = problems[2];
  assert.equal(heartworm.sourceEntry?.id, testId);
  assert.equal(heartworm.characteristic?.name, name("Deaf"));
  assert.deepEqual(
    heartworm.events.map((event) => event.action),
    [MedicalConditionEventAction.CREATED, MedicalConditionEventAction.EDITED],
  );

  // The open episode first, then the rest by start day, newest first.
  const episodes = await findCareEpisodes(prisma, animalId);
  assert.deepEqual(
    episodes.map((episode) => episode.id),
    [openId, voidedId, clinicStayId],
  );
  assert.equal(episodes[2].partner?.name, name("Page Clinic"));
  assert.equal(episodes[2].closedBy?.name, name("Condition editor"));

  // Every id the events hold reads as a name.
  const names = await findConditionEventNames(prisma, problems, episodes);
  assert.equal(names[testId], `${name("Heartworm antigen")} test of Sep 3, 2026`);
  assert.equal(names[examId], "intake exam of Aug 1, 2026");
  assert.equal(names[heartwormTraitId], name("Heartworm Positive"));
  assert.equal(names[deafTraitId], name("Deaf"));
  assert.equal(names[clinicId], name("Page Clinic"));

  // What the forms offer: live medical traits, and this animal's completed,
  // live tests and exams, newest first.
  const choices = await findConditionFormChoices(prisma, animalId);
  const traitIds = choices.characteristics.map((trait) => trait.id);
  assert.ok(traitIds.includes(heartwormTraitId) && traitIds.includes(deafTraitId));
  assert.ok(!traitIds.includes(behaviourTraitId) && !traitIds.includes(retiredTraitId));
  assert.deepEqual(choices.sources, [
    { id: testId, label: `${name("Heartworm antigen")} test of Sep 3, 2026` },
    { id: examId, label: "intake exam of Aug 1, 2026" },
  ]);
  assert.ok(choices.vetClinics.some((clinic) => clinic.id === clinicId));
});

test("History pages entries, conditions and care episodes together, newest first, with the kind filter", async () => {
  const animalId = await makeAnimal("History");
  const examId = await recordIntakeExam(animalId); // Aug 1
  const testId = await recordHeartwormTest(animalId); // Sep 3
  const { conditionId: undatedId } = await add(animalId, condition({ name: "Otitis" }));
  const { conditionId: heartwormId } = await add(
    animalId,
    condition({ onsetDate: day("2026-09-10") }),
  );
  const { conditionId: voidedConditionId } = await add(
    animalId,
    condition({ name: "Ringworm", onsetDate: day("2026-08-20") }),
  );
  await voidIt(voidedConditionId, "Wrong animal.");
  const run = <T>(write: (tx: TransactionClient) => Promise<T>) =>
    prisma.$transaction(write);
  const { episodeId: closedId } = await run((tx) =>
    openCareEpisode(
      tx,
      {
        animalId,
        type: CareEpisodeType.UNDER_VET_CARE,
        startDate: day("2026-08-15"),
        endDate: day("2026-08-18"),
        reason: "Cough.",
      },
      staffId,
      TODAY,
    ),
  );
  const { episodeId: voidedEpisodeId } = await run((tx) =>
    openCareEpisode(
      tx,
      { animalId, type: CareEpisodeType.HOSPITALISED_IN_HOUSE, startDate: day("2026-09-20"), reason: "Wrong." },
      staffId,
      TODAY,
    ),
  );
  await run((tx) => voidCareEpisode(tx, voidedEpisodeId, "Wrong animal.", editorId));

  const page = (kinds: MedicalHistoryKind[], pageNumber = 1, perPage = 10) =>
    findMedicalHistoryPage(prisma, animalId, {
      kinds,
      page: pageNumber,
      perPage,
      timeZone: "UTC",
    });
  const ids = (result: Awaited<ReturnType<typeof page>>) =>
    result.items.map((item) => [item.source, item.id]);

  // A condition with no onset goes by the day it was recorded (today, after
  // every other day here); voided rows are listed.
  const everything: [string, string][] = [
    ["CONDITION", undatedId],
    ["EPISODE", voidedEpisodeId],
    ["CONDITION", heartwormId],
    ["ENTRY", testId],
    ["CONDITION", voidedConditionId],
    ["EPISODE", closedId],
    ["ENTRY", examId],
  ];
  assert.deepEqual(ids(await page([])), everything);

  // Paged across all three tables.
  const first = await page([], 1, 3);
  assert.deepEqual(ids(first), everything.slice(0, 3));
  assert.equal(first.totalPages, 3);
  assert.deepEqual(ids(await page([], 3, 3)), everything.slice(6));

  // The kind filter: conditions alone; episodes with one entry kind.
  assert.deepEqual(
    ids(await page(["CONDITION"])),
    everything.filter(([source]) => source === "CONDITION"),
  );
  const mixed = await page(["CARE_EPISODE", MedicalEntryKind.TEST]);
  assert.deepEqual(ids(mixed), [
    ["EPISODE", voidedEpisodeId],
    ["ENTRY", testId],
    ["EPISODE", closedId],
  ]);
  assert.equal(mixed.totalPages, 1);

  // Each row carries what its own row component shows.
  const rows = (await page([])).items;
  const voidedCondition = rows.find((item) => item.id === voidedConditionId);
  assert.ok(voidedCondition?.source === "CONDITION" && voidedCondition.condition.voidedAt);
  const voidedEpisode = rows.find((item) => item.id === voidedEpisodeId);
  assert.ok(voidedEpisode?.source === "EPISODE" && voidedEpisode.episode.voidedAt);
});

// ---------------------------------------------------------------------------
// A condition's trait
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-10T18:00:00Z");

const addTrait = (
  animalId: string,
  conditionId: string,
  actorId = editorId,
  at = NOW,
) =>
  prisma.$transaction((tx) =>
    addCharacteristicFromCondition(tx, { animalId, conditionId }, actorId, at),
  );

const assignmentOf = (animalId: string, characteristicId: string) =>
  prisma.animalCharacteristic.findUnique({
    where: { animalId_characteristicId: { animalId, characteristicId } },
    select: {
      assignedById: true,
      assignedAt: true,
      sourceConditionId: true,
      sourceAssessmentId: true,
      removedAt: true,
    },
  });

test("a live condition adds its trait citing it, re-cites one already there, and leaves one citing it", async () => {
  const animalId = await makeAnimal("Trait");
  const { conditionId } = await add(
    animalId,
    condition({ characteristicId: heartwormTraitId }),
  );

  // Not on the animal: added, citing the condition.
  assert.deepEqual(await addTrait(animalId, conditionId), {
    status: "added",
    message: `${name("Heartworm Positive")} added to the animal.`,
  });
  assert.deepEqual(await assignmentOf(animalId, heartwormTraitId), {
    assignedById: editorId,
    assignedAt: NOW,
    sourceConditionId: conditionId,
    sourceAssessmentId: null,
    removedAt: null,
  });
  // Already citing it: nothing written.
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  assert.equal((await addTrait(animalId, conditionId, staffId)).status, "unchanged");
  assert.equal((await assignmentOf(animalId, heartwormTraitId))?.assignedById, editorId);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);

  // On the animal by hand: the condition is cited instead.
  const { conditionId: deafnessId } = await add(
    animalId,
    condition({ name: "Congenital deafness", status: CHRONIC, characteristicId: deafTraitId }),
  );
  await prisma.$transaction((tx) =>
    reconcileAnimalCharacteristics(
      tx,
      { animalId, characteristicIds: [heartwormTraitId, deafTraitId] },
      staffId,
      NOW,
    ),
  );
  assert.equal((await assignmentOf(animalId, deafTraitId))?.sourceConditionId, null);
  assert.equal((await addTrait(animalId, deafnessId)).status, "cited");
  assert.equal((await assignmentOf(animalId, deafTraitId))?.sourceConditionId, deafnessId);

  const feed = (await feedOf(animalId)).filter(
    (row) => row.activityType === AnimalActivityType.FIELD_UPDATE,
  );
  assert.deepEqual(
    feed.map((row) => [row.changedById, row.changeSummary]),
    [
      [editorId, `${name("Heartworm Positive")} added, citing the condition Heartworm disease.`],
      [staffId, `Characteristics updated: added ${name("Deaf")}.`],
      [editorId, `${name("Deaf")} re-cited to the condition Congenital deafness.`],
    ],
  );

  // A trait removed since is added again, citing the condition.
  await prisma.animalCharacteristic.update({
    where: { animalId_characteristicId: { animalId, characteristicId: heartwormTraitId } },
    data: { removedAt: NOW, removedById: staffId },
  });
  assert.equal((await addTrait(animalId, conditionId)).status, "added");
  assert.equal((await assignmentOf(animalId, heartwormTraitId))?.removedAt, null);
});

test("a resolved, voided or trait-less condition, another animal's, or a retired trait adds nothing", async () => {
  const animalId = await makeAnimal("No trait");
  const otherId = await makeAnimal("Other trait");
  const refusedWith = async (conditionId: string, message: RegExp, on = animalId) => {
    const traitsBefore = await prisma.animalCharacteristic.count({ where: { animalId: on } });
    const feedBefore = await prisma.animalActivityLog.count({ where: { animalId: on } });
    await assert.rejects(addTrait(on, conditionId), (error: unknown) => {
      assert.ok(error instanceof MedicalEntryRefusal, String(error));
      assert.match(error.message, message);
      return true;
    });
    assert.equal(await prisma.animalCharacteristic.count({ where: { animalId: on } }), traitsBefore);
    assert.equal(await prisma.animalActivityLog.count({ where: { animalId: on } }), feedBefore);
  };

  const { conditionId: resolvedId } = await add(
    animalId,
    condition({ characteristicId: heartwormTraitId }),
  );
  await edit(resolvedId, { status: RESOLVED, resolvedDate: TODAY });
  await refusedWith(resolvedId, /is resolved/);

  const { conditionId: voidedId } = await add(
    animalId,
    condition({ name: "Deafness", characteristicId: deafTraitId }),
  );
  await voidIt(voidedId, "Wrong animal.");
  await refusedWith(voidedId, /was voided/);

  const { conditionId: plainId } = await add(animalId, condition({ name: "Otitis" }));
  await refusedWith(plainId, /doesn't name a trait/);

  const { conditionId: othersId } = await add(
    otherId,
    condition({ characteristicId: heartwormTraitId }),
  );
  await refusedWith(othersId, /isn't on this animal's record/);

  // A trait retired after the condition named it.
  const laterRetiredId = (
    await prisma.characteristic.create({
      data: { name: name("Later Retired"), category: CharacteristicCategory.MEDICAL },
      select: { id: true },
    })
  ).id;
  const { conditionId: namingRetiredId } = await add(
    animalId,
    condition({ name: "Mange", characteristicId: laterRetiredId }),
  );
  await prisma.characteristic.update({
    where: { id: laterRetiredId },
    data: { deletedAt: NOW },
  });
  await refusedWith(namingRetiredId, /has been retired/);
});

test("the manual path clears a condition's citation when it puts a trait back", async () => {
  const animalId = await makeAnimal("Manual");
  const { conditionId } = await add(
    animalId,
    condition({ characteristicId: heartwormTraitId }),
  );
  await addTrait(animalId, conditionId);
  const reconcile = (characteristicIds: string[]) =>
    prisma.$transaction((tx) =>
      reconcileAnimalCharacteristics(tx, { animalId, characteristicIds }, staffId, NOW),
    );
  // Kept by a save that doesn't touch it, so it still cites the condition.
  await reconcile([heartwormTraitId]);
  assert.equal((await assignmentOf(animalId, heartwormTraitId))?.sourceConditionId, conditionId);
  // Removed, then put back by hand: no source.
  await reconcile([]);
  await reconcile([heartwormTraitId]);
  const assignment = await assignmentOf(animalId, heartwormTraitId);
  assert.equal(assignment?.removedAt, null);
  assert.equal(assignment?.sourceConditionId, null);
  assert.equal(assignment?.sourceAssessmentId, null);
});

test("readiness flags a trait whose condition was resolved or voided, through both reads", async () => {
  const live = await makeAnimal("Readiness live");
  const resolved = await makeAnimal("Readiness resolved");
  const voided = await makeAnimal("Readiness voided");
  const traitFrom = async (animalId: string) => {
    const { conditionId } = await add(
      animalId,
      condition({ characteristicId: heartwormTraitId }),
    );
    await addTrait(animalId, conditionId, editorId, new Date("2026-09-01T12:00:00Z"));
    return conditionId;
  };
  await traitFrom(live);
  await edit(await traitFrom(resolved), { status: RESOLVED, resolvedDate: day("2026-10-09") });
  const voidedId = await traitFrom(voided);
  await voidIt(voidedId, "Wrong animal.");
  const { voidedAt } = await stored(voidedId);

  const shelterDay = { timezone: "America/Los_Angeles", today: day("2026-10-14") };
  const animalIds = [live, resolved, voided];
  const flagsOf = (blockers: { kind: string }[]) =>
    blockers.filter((blocker) => blocker.kind === "UNSUPPORTED_CHARACTERISTIC");
  const one = new Map<string, unknown>();
  for (const animalId of animalIds) {
    one.set(animalId, flagsOf((await findAnimalReadiness(prisma, animalId, shelterDay))!.blockers));
  }
  const board = new Map<string, unknown>();
  for (const readiness of await findReadinessForAnimals(prisma, shelterDay, { animalIds })) {
    board.set(readiness.animal.id, flagsOf(readiness.blockers));
  }
  const flag = (issue: string, since: Date) => [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: heartwormTraitId,
      characteristicName: name("Heartworm Positive"),
      issue,
      since,
    },
  ];
  // The trait was added on Sep 1; the condition resolved on Oct 9, from
  // midnight in Los Angeles, and was voided when it was.
  const expected = new Map<string, unknown>([
    [live, []],
    [resolved, flag("CONDITION_RESOLVED", new Date("2026-10-09T07:00:00Z"))],
    [voided, flag("CONDITION_VOIDED", voidedAt!)],
  ]);
  assert.deepEqual(one, expected);
  assert.deepEqual(board, expected);
});

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

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

test("two adds of one name at once: the second waits for the lock, then is refused", async () => {
  const animalId = await makeAnimal("At once");

  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  // Stands in for another add to the same animal, holding the lock while it
  // writes.
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      return addMedicalCondition(tx, { ...condition(), animalId }, staffId, TODAY);
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const second = add(animalId, condition({ name: "heartworm disease" }), { timeout });
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void second.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    // Released even when the wait fails, and both seen to their end, so
    // neither transaction outlives the test.
    release();
    await Promise.allSettled([holder, second]);
  }
  await holder;
  await assert.rejects(second, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal);
    assert.equal(error.field, "name");
    return true;
  });
  assert.equal(await prisma.medicalCondition.count({ where: { animalId } }), 1);
});
