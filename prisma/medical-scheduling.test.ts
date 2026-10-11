// Scheduling medical care, against a real Postgres. A scheduled entry is only
// as good as what the rows say afterwards (the entry, its events and the
// animal's activity), and what the reads that derive facts make of it.
//
// `medical-entry.ts` is the whole of each entry action bar the session check
// and the cache invalidation, so driving it is driving the actions.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  Sex,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  editMedicalEntry,
  recordMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type MedicalEntryInput,
  type ScheduleMedicalEntryInput,
  type VaccineEntryInput,
} from "@/app/lib/services/medical-entry";
import {
  createMedicalItem,
  retireMedicalItem,
  updateMedicalItem,
  type MedicalItemInput,
} from "@/app/lib/services/medical-catalog";
import {
  findDueMedicalEntries,
  findLatestRabiesVaccine,
  findMedicalHistoryPage,
  findRecentMedicalEntries,
  findVaccinesAndTests,
} from "@/app/lib/data/animals/medical-entry";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { ConflictError } from "@/app/lib/utils/errors";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let dogId: string;
let catId: string;
let colorId: string;
let staffId: string;
let editorId: string;

let rabiesId: string;
let dhppId: string;
let catVaccineId: string;
let retiredVaccineId: string;
let dewormerId: string;

const name = (label: string) => `${label} ${runId}`;

const createItem = async (input: MedicalItemInput) =>
  (await prisma.$transaction((tx) => createMedicalItem(tx, input))).id;

before(async () => {
  const species = async (label: string) =>
    (
      await prisma.species.create({
        data: { name: `Scheduling ${label} ${runId}` },
        select: { id: true },
      })
    ).id;
  const person = async (label: string) =>
    (
      await prisma.person.create({
        data: { name: `${label} ${runId}` },
        select: { id: true },
      })
    ).id;

  dogId = await species("dog");
  catId = await species("cat");
  colorId = (
    await prisma.color.create({
      data: { name: `Scheduling color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Scheduling staff");
  editorId = await person("Scheduling editor");

  rabiesId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Rabies"),
    speciesIds: [dogId, catId],
    isRabies: true,
    analytes: [],
  });
  dhppId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("DHPP"),
    speciesIds: [dogId],
    repeatIntervalDays: 14,
    analytes: [],
  });
  catVaccineId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("FVRCP"),
    speciesIds: [catId],
    analytes: [],
  });
  retiredVaccineId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Old stock"),
    speciesIds: [],
    analytes: [],
  });
  await prisma.$transaction((tx) => retireMedicalItem(tx, retiredVaccineId));
  dewormerId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Dewormer"),
    speciesIds: [],
    analytes: [],
  });
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their events and activity rows with it.
  await prisma.animal.deleteMany({
    where: { speciesId: { in: [dogId, catId] } },
  });
  await prisma.medicalItem.deleteMany({
    where: { name: { endsWith: runId } },
  });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, editorId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [dogId, catId] } } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  options: { speciesId?: string; listingStatus?: AnimalListingStatus } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId: options.speciesId ?? dogId,
        primaryColorId: colorId,
        listingStatus: options.listingStatus,
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

const schedule = (
  animalId: string,
  overrides: Partial<Omit<ScheduleMedicalEntryInput, "animalId">> = {},
  actorId = staffId,
  today: CalendarDay = TODAY,
) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.VACCINE,
        itemId: dhppId,
        dueDate: day("2026-10-14"),
        ...overrides,
      },
      actorId,
      today,
    ),
  );

const record = (animalId: string, input: MedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY),
  );

const givenVaccine = (
  overrides: Partial<VaccineEntryInput> = {},
): VaccineEntryInput => ({
  kind: MedicalEntryKind.VACCINE,
  itemId: dhppId,
  completedDate: day("2026-09-01"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const voidEntry = (entryId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, editorId));

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
          AnimalActivityType.MEDICAL_ENTRY_RECORDED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

/** Rejects with a refusal on `field` (undefined: one with no field). */
const refusedOn = async (
  promise: Promise<unknown>,
  field: string | undefined,
  message?: string,
) => {
  await assert.rejects(promise, (error: Error) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field, error.message);
    if (message) assert.equal(error.message, message);
    return true;
  });
};

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

test("a scheduled entry has its due day and nothing about how it will be given", async () => {
  const animalId = await makeAnimal("Scheduled");
  const { entryId } = await schedule(animalId, { notes: "  Booster  " });

  const entry = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { vaccine: true, test: true, treatment: true },
  });
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(entry.kind, MedicalEntryKind.VACCINE);
  assert.equal(entry.itemId, dhppId);
  assert.equal(entry.dueDate, "2026-10-14");
  assert.equal(entry.notes, "Booster");
  assert.equal(entry.createdById, staffId);
  for (const field of [
    "completedDate",
    "source",
    "declineReason",
    "administeredById",
    "vetPartnerId",
    "vetName",
    "voidedAt",
  ] as const) {
    assert.equal(entry[field], null, field);
  }
  // Details are written when the care is given, not before.
  assert.equal(entry.vaccine, null);
  assert.equal(entry.test, null);
  assert.equal(entry.treatment, null);

  const events = await eventsOf(entryId);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, MedicalEntryEventAction.CREATED);
  assert.equal(events[0].actorId, staffId);
  assert.equal(events[0].before, null);
  assert.deepEqual(events[0].after, {
    kind: MedicalEntryKind.VACCINE,
    status: MedicalEntryStatus.SCHEDULED,
    itemId: dhppId,
    dueDate: "2026-10-14",
    notes: "Booster",
  });

  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
      changedById: staffId,
      changeSummary: `${name("DHPP")} vaccine scheduled for Oct 14, 2026.`,
    },
  ]);
});

test("care can be scheduled for a treatment, and for today", async () => {
  const animalId = await makeAnimal("Treatment today");
  const { entryId } = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    dueDate: TODAY,
  });
  const entry = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { treatment: true },
  });
  assert.equal(entry.dueDate, "2026-10-10");
  assert.equal(entry.treatment, null);
});

test("nothing is scheduled for an animal that has left the shelter's care", async () => {
  const animalId = await makeAnimal("Archived", {
    listingStatus: AnimalListingStatus.ARCHIVED,
  });
  await refusedOn(
    schedule(animalId),
    undefined,
    "This animal has left the shelter's care, so nothing can be scheduled for it.",
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
});

test("the item must be of the entry's kind, live, and for the animal's species", async () => {
  const animalId = await makeAnimal("Item rules");
  await refusedOn(schedule(animalId, { itemId: retiredVaccineId }), "itemId");
  await refusedOn(schedule(animalId, { itemId: catVaccineId }), "itemId");
  await refusedOn(
    schedule(animalId, { kind: MedicalEntryKind.TREATMENT, itemId: dhppId }),
    "itemId",
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
});

test("the due day is from today up to five years ahead", async () => {
  const animalId = await makeAnimal("Due rules");
  await refusedOn(
    schedule(animalId, { dueDate: day("2026-10-09") }),
    "dueDate",
    "The due date can't be in the past.",
  );
  await refusedOn(
    schedule(animalId, { dueDate: day("2031-10-11") }),
    "dueDate",
    "The due date can't be more than 5 years from today.",
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);

  const { entryId } = await schedule(animalId, { dueDate: day("2031-10-10") });
  assert.equal(
    (await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } }))
      .dueDate,
    "2031-10-10",
  );
});

// ---------------------------------------------------------------------------
// Edit and void
// ---------------------------------------------------------------------------

test("a scheduled entry can't be edited", async () => {
  const animalId = await makeAnimal("No edit");
  const { entryId } = await schedule(animalId);
  await assert.rejects(
    prisma.$transaction((tx) =>
      editMedicalEntry(tx, entryId, givenVaccine({ notes: "Changed" }), editorId, TODAY),
    ),
    (error: Error) => {
      assert.ok(error instanceof ConflictError, String(error));
      assert.match(error.message, /Reschedule it, or void it and schedule it again/);
      return true;
    },
  );
  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(entry.notes, null);
  assert.equal((await eventsOf(entryId)).length, 1);
});

test("a scheduled entry can be voided, and the activity names its due day", async () => {
  const animalId = await makeAnimal("Void scheduled");
  const { entryId } = await schedule(animalId);
  await voidEntry(entryId, "  Scheduled on the wrong animal.  ");

  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.ok(entry.voidedAt);
  assert.equal(entry.voidedById, editorId);
  assert.equal(entry.voidReason, "Scheduled on the wrong animal.");
  // A void leaves the status alone: it says the entry counts for nothing.
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);

  const events = await eventsOf(entryId);
  assert.deepEqual(
    events.map((event) => [event.action, event.after]),
    [
      [MedicalEntryEventAction.CREATED, events[0].after],
      [MedicalEntryEventAction.VOIDED, { voidReason: "Scheduled on the wrong animal." }],
    ],
  );
  const activity = await activityOf(animalId);
  assert.deepEqual(activity.at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_VOIDED,
    changedById: editorId,
    changeSummary: `${name("DHPP")} vaccine due Oct 14, 2026 was voided. Reason: Scheduled on the wrong animal.`,
  });

  await assert.rejects(voidEntry(entryId, "Again."), ConflictError);
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

test("the reads that derive facts leave scheduled care out; the due list has it", async () => {
  const animalId = await makeAnimal("Reads");

  // Only scheduled rabies: none on record.
  const firstRabies = await schedule(animalId, { itemId: rabiesId });
  assert.equal(await findLatestRabiesVaccine(prisma, animalId), null);

  const given = await record(
    animalId,
    givenVaccine({ itemId: rabiesId, durationMonths: 12 }),
  );
  // A later rabies booster that is only scheduled doesn't move the latest.
  // It has no vaccine row, so the read's details filter alone leaves it out;
  // the next test checks the status filter on its own.
  await schedule(animalId, { itemId: rabiesId, dueDate: day("2027-08-01") });
  assert.equal(
    (await findLatestRabiesVaccine(prisma, animalId))?.entryId,
    given.entryId,
  );

  const dewormer = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    dueDate: day("2026-10-12"),
  });
  const voided = await schedule(animalId, { dueDate: day("2026-10-11") });
  await voidEntry(voided.entryId, "Duplicate.");

  assert.deepEqual(
    (await findRecentMedicalEntries(prisma, animalId, 10)).map((entry) => entry.id),
    [given.entryId],
  );
  assert.deepEqual(
    (await findVaccinesAndTests(prisma, animalId)).map((entry) => entry.id),
    [given.entryId],
  );

  const due = await findDueMedicalEntries(prisma, animalId);
  assert.deepEqual(
    due.map((entry) => [entry.dueDate, entry.status]),
    [
      ["2026-10-12", MedicalEntryStatus.SCHEDULED],
      ["2026-10-14", MedicalEntryStatus.SCHEDULED],
      ["2027-08-01", MedicalEntryStatus.SCHEDULED],
    ],
  );
  assert.equal(due[0].id, dewormer.entryId);
  assert.equal(due[1].id, firstRabies.entryId);
  assert.equal(due[0].treatment, null);
});

test("the latest rabies vaccine counts only completed entries, whatever rows exist", async () => {
  const animalId = await makeAnimal("Rabies status");
  const { entryId } = await record(
    animalId,
    givenVaccine({ itemId: rabiesId, durationMonths: 12 }),
  );
  assert.equal((await findLatestRabiesVaccine(prisma, animalId))?.entryId, entryId);
  // The service never leaves a vaccine row on an entry that isn't completed;
  // this forces one, so only the read's status filter can leave it out.
  await prisma.medicalEntry.update({
    where: { id: entryId },
    data: { status: MedicalEntryStatus.DECLINED },
  });
  assert.equal(await findLatestRabiesVaccine(prisma, animalId), null);
});

test("history shows every entry, newest first by the day given or due", async () => {
  const animalId = await makeAnimal("History");
  const unknownDay = await record(
    animalId,
    givenVaccine({
      itemId: rabiesId,
      durationMonths: 12,
      source: MedicalEntrySource.BEFORE_INTAKE,
      completedDate: null,
    }),
  );
  const september = await record(animalId, givenVaccine());
  const soon = await schedule(animalId, { dueDate: day("2026-10-12") });
  const later = await schedule(animalId, { dueDate: day("2026-10-20") });
  const voided = await schedule(animalId, { dueDate: day("2026-11-01") });
  await voidEntry(voided.entryId, "Not needed.");
  const treatment = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    dueDate: day("2026-10-15"),
  });
  // Due today and given today share a day; the one written later comes
  // first, whatever its status.
  const dueToday = await schedule(animalId, { dueDate: TODAY });
  const today = await record(animalId, givenVaccine({ completedDate: TODAY }));

  const page = (perPage: number, pageNumber = 1, kinds: MedicalEntryKind[] = []) =>
    findMedicalHistoryPage(prisma, animalId, { kinds, page: pageNumber, perPage });

  const all = await page(10);
  assert.deepEqual(
    all.entries.map((entry) => entry.id),
    [
      voided.entryId,
      later.entryId,
      treatment.entryId,
      soon.entryId,
      today.entryId,
      dueToday.entryId,
      september.entryId,
      unknownDay.entryId,
    ],
  );
  assert.equal(all.totalPages, 1);

  const second = await page(3, 2);
  assert.deepEqual(
    second.entries.map((entry) => entry.id),
    [soon.entryId, today.entryId, dueToday.entryId],
  );
  assert.equal(second.totalPages, 3);

  // The page count follows the filter too: 7 vaccines make 3 pages of 3.
  const vaccines = await page(3, 3, [MedicalEntryKind.VACCINE]);
  assert.deepEqual(
    vaccines.entries.map((entry) => entry.id),
    [unknownDay.entryId],
  );
  assert.equal(vaccines.totalPages, 3);
  const treatments = await page(1, 1, [MedicalEntryKind.TREATMENT]);
  assert.deepEqual(
    treatments.entries.map((entry) => entry.id),
    [treatment.entryId],
  );
  assert.equal(treatments.totalPages, 1);
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("an item used only by scheduled care can't change kind", async () => {
  const animalId = await makeAnimal("Catalog use");
  const itemName = name("Scheduled only");
  const itemId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: itemName,
    speciesIds: [],
    analytes: [],
  });
  await schedule(animalId, { itemId });
  await assert.rejects(
    prisma.$transaction((tx) =>
      updateMedicalItem(tx, itemId, {
        kind: MedicalItemKind.TREATMENT,
        name: itemName,
        speciesIds: [],
        analytes: [],
      }),
    ),
    ConflictError,
  );
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id: itemId } })).kind,
    MedicalItemKind.VACCINE,
  );
});
