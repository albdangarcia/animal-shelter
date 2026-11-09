// Scheduling medical care, against a real Postgres. A scheduled entry is only
// as good as what the rows say afterwards (the entry, its events and the
// animal's activity), and what the reads that derive facts make of it.
//
// `medical-entry.ts` is the whole of each entry action bar the session check
// and the cache invalidation, so driving it is driving the actions.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  DoseUnit,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  MedicalRoute,
  Sex,
  TestResult,
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
  type RecordMedicalEntryInput,
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
  type MedicalHistoryItem,
} from "@/app/lib/data/animals/medical-entry";
import { findMedicalEntryFormItems } from "@/app/lib/data/medical-catalog";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { ConflictError } from "@/app/lib/utils/errors";
import type { CatalogEntryKind } from "@/app/lib/constants/medical";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.

// History's entries: the animals here have no conditions or care episodes,
// so every row of a page is an entry.
const historyEntries = (page: { items: MedicalHistoryItem[] }) =>
  page.items.flatMap((item) => (item.source === "ENTRY" ? [item.entry] : []));

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
let selamectinId: string;
let snapTestId: string;
let snapAnalyteIds: string[];

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
    manufacturer: "Zoetis",
    speciesIds: [dogId],
    defaultRoute: MedicalRoute.SUBCUTANEOUS,
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
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseAmount: 2,
    defaultDoseUnit: DoseUnit.ML,
    analytes: [],
  });
  selamectinId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Selamectin"),
    speciesIds: [],
    defaultRoute: MedicalRoute.TOPICAL,
    defaultDoseAmount: 1,
    defaultDoseUnit: DoseUnit.APPLICATION,
    repeatIntervalDays: 30,
    analytes: [],
  });
  snapTestId = await createItem({
    kind: MedicalItemKind.TEST,
    name: name("Snap test"),
    speciesIds: [],
    analytes: [{ name: "Antigen" }, { name: "Antibody" }],
  });
  snapAnalyteIds = (
    await prisma.medicalItemAnalyte.findMany({
      where: { itemId: snapTestId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    })
  ).map((row) => row.id);
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
  overrides: Partial<{
    kind: CatalogEntryKind;
    itemId: string;
    dueDate: CalendarDay;
    notes: string | null;
  }> = {},
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

const record = (animalId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY),
  );

const recordScheduled = (
  entryId: string,
  input: RecordMedicalEntryInput,
  actorId = editorId,
) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(tx, entryId, input, actorId, TODAY),
  );

const givenVaccine = (
  overrides: Partial<VaccineEntryInput & Pick<RecordMedicalEntryInput, "scheduleNext">> = {},
): VaccineEntryInput & Pick<RecordMedicalEntryInput, "scheduleNext"> => ({
  kind: MedicalEntryKind.VACCINE,
  itemId: dhppId,
  completedDate: day("2026-09-01"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const voidEntry = (entryId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, editorId));

const reschedule = (
  entryId: string,
  dueDate: CalendarDay,
  options: { actorId?: string; timeout?: number } = {},
) =>
  prisma.$transaction(
    (tx) =>
      rescheduleMedicalEntry(tx, entryId, dueDate, options.actorId ?? editorId, TODAY),
    { timeout: options.timeout },
  );

const decline = (entryId: string, reason: string, actorId = editorId) =>
  prisma.$transaction((tx) => declineMedicalEntry(tx, entryId, reason, actorId));

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
// Reschedule and decline
// ---------------------------------------------------------------------------

/** Rejects with a ConflictError whose message matches `pattern`. */
const conflicts = async (promise: Promise<unknown>, pattern: RegExp) => {
  await assert.rejects(promise, (error: Error) => {
    assert.ok(error instanceof ConflictError, String(error));
    assert.match(error.message, pattern);
    return true;
  });
};

test("rescheduling moves the due day, with an event and an activity row", async () => {
  const animalId = await makeAnimal("Rescheduled");
  const { entryId } = await schedule(animalId);
  await reschedule(entryId, day("2026-10-20"));

  const entry = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { vaccine: true },
  });
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(entry.dueDate, "2026-10-20");
  assert.equal(entry.itemId, dhppId);
  assert.equal(entry.vaccine, null);

  const events = await eventsOf(entryId);
  assert.equal(events.length, 2);
  assert.equal(events[1].action, MedicalEntryEventAction.RESCHEDULED);
  assert.equal(events[1].actorId, editorId);
  assert.deepEqual(events[1].before, { dueDate: "2026-10-14" });
  assert.deepEqual(events[1].after, { dueDate: "2026-10-20" });

  assert.deepEqual((await activityOf(animalId)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_RESCHEDULED,
    changedById: editorId,
    changeSummary: `${name("DHPP")} vaccine rescheduled from Oct 14, 2026 to Oct 20, 2026.`,
  });

  // An overdue entry can be brought forward to today.
  const overdue = await schedule(animalId, {}, staffId, day("2026-10-01"));
  await prisma.$transaction((tx) =>
    rescheduleMedicalEntry(tx, overdue.entryId, day("2026-10-05"), staffId, day("2026-10-01")),
  );
  await reschedule(overdue.entryId, TODAY);
  assert.equal(
    (await prisma.medicalEntry.findUniqueOrThrow({ where: { id: overdue.entryId } }))
      .dueDate,
    "2026-10-10",
  );
});

test("a reschedule must change the day and keep to the scheduling rules", async () => {
  const animalId = await makeAnimal("Reschedule rules");
  const { entryId } = await schedule(animalId);
  await refusedOn(
    reschedule(entryId, day("2026-10-14")),
    "dueDate",
    "That is already its due date. Pick another day.",
  );
  await refusedOn(
    reschedule(entryId, day("2026-10-09")),
    "dueDate",
    "The due date can't be in the past.",
  );
  await refusedOn(
    reschedule(entryId, day("2031-10-11")),
    "dueDate",
    "The due date can't be more than 5 years from today.",
  );
  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(entry.dueDate, "2026-10-14");
  assert.equal((await eventsOf(entryId)).length, 1);
});

test("declining keeps the entry, with its reason, an event and an activity row", async () => {
  const animalId = await makeAnimal("Declined");
  const { entryId } = await schedule(animalId);
  await decline(entryId, "  Vet advised against it.  ");

  const entry = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { vaccine: true },
  });
  assert.equal(entry.status, MedicalEntryStatus.DECLINED);
  assert.equal(entry.declineReason, "Vet advised against it.");
  assert.equal(entry.dueDate, "2026-10-14");
  assert.equal(entry.itemId, dhppId);
  for (const field of ["completedDate", "source", "administeredById", "voidedAt"] as const) {
    assert.equal(entry[field], null, field);
  }
  assert.equal(entry.vaccine, null);

  const events = await eventsOf(entryId);
  assert.equal(events.length, 2);
  assert.equal(events[1].action, MedicalEntryEventAction.DECLINED);
  assert.equal(events[1].actorId, editorId);
  assert.deepEqual(events[1].before, { status: MedicalEntryStatus.SCHEDULED });
  assert.deepEqual(events[1].after, {
    status: MedicalEntryStatus.DECLINED,
    declineReason: "Vet advised against it.",
  });

  assert.deepEqual((await activityOf(animalId)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_DECLINED,
    changedById: editorId,
    changeSummary: `${name("DHPP")} vaccine due Oct 14, 2026 was declined. Reason: Vet advised against it.`,
  });
});

test("a decline needs a reason of at most 1000 characters", async () => {
  const animalId = await makeAnimal("Decline reason");
  const { entryId } = await schedule(animalId);
  await refusedOn(
    decline(entryId, "   "),
    "reason",
    "A reason for declining this entry is required.",
  );
  await refusedOn(
    decline(entryId, "x".repeat(1001)),
    "reason",
    "The reason cannot exceed 1000 characters.",
  );
  await decline(entryId, ` ${"x".repeat(1000)} `);
  assert.equal(
    (await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } }))
      .declineReason?.length,
    1000,
  );
});

test("only scheduled care that isn't voided can be rescheduled or declined", async () => {
  const animalId = await makeAnimal("Not scheduled");
  const completed = await record(animalId, givenVaccine());
  const declined = await schedule(animalId);
  await decline(declined.entryId, "Not needed.");
  const voided = await schedule(animalId);
  await voidEntry(voided.entryId, "Duplicate.");

  for (const [entryId, pattern] of [
    [completed.entryId, /already been recorded as given/],
    [declined.entryId, /was declined/],
    [voided.entryId, /was voided/],
  ] as const) {
    await conflicts(reschedule(entryId, day("2026-10-20")), pattern);
    await conflicts(decline(entryId, "Again."), pattern);
    assert.equal((await eventsOf(entryId)).length, entryId === completed.entryId ? 1 : 2);
  }
});

test("a declined entry can be voided but not edited", async () => {
  const animalId = await makeAnimal("Declined then voided");
  const { entryId } = await schedule(animalId);
  await decline(entryId, "Owner reclaimed the dog before it was due.");

  await assert.rejects(
    prisma.$transaction((tx) =>
      editMedicalEntry(tx, entryId, givenVaccine({ notes: "Changed" }), editorId, TODAY),
    ),
    (error: Error) => {
      assert.ok(error instanceof ConflictError, String(error));
      assert.match(error.message, /was declined, so it can't be edited/);
      return true;
    },
  );

  await voidEntry(entryId, "Declined on the wrong animal.");
  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.ok(entry.voidedAt);
  assert.equal(entry.status, MedicalEntryStatus.DECLINED);
  assert.deepEqual((await activityOf(animalId)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_VOIDED,
    changedById: editorId,
    changeSummary: `${name("DHPP")} vaccine due Oct 14, 2026 was voided. Reason: Declined on the wrong animal.`,
  });
});

test("declined care is off the due list and counts for nothing", async () => {
  const animalId = await makeAnimal("Declined reads");
  const rabies = await schedule(animalId, { itemId: rabiesId });
  const kept = await schedule(animalId, { dueDate: day("2026-10-20") });
  await decline(rabies.entryId, "Exempt on a vet's advice.");

  assert.deepEqual(
    (await findDueMedicalEntries(prisma, animalId)).map((entry) => entry.id),
    [kept.entryId],
  );
  assert.equal(await findLatestRabiesVaccine(prisma, animalId), null);
  assert.deepEqual(await findRecentMedicalEntries(prisma, animalId, 10), []);
  assert.deepEqual(await findVaccinesAndTests(prisma, animalId), []);
});

// ---------------------------------------------------------------------------
// Recording scheduled care as given
// ---------------------------------------------------------------------------

/** The entry's row now, with its details. */
const entryNow = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: {
      vaccine: true,
      treatment: true,
      test: { include: { results: { orderBy: { analyteName: "asc" } } } },
    },
  });

test("recording scheduled care writes its details, keeps the due day and fills the item's defaults", async () => {
  const animalId = await makeAnimal("Recorded from schedule");
  const { entryId } = await schedule(animalId);
  const result = await recordScheduled(
    entryId,
    givenVaccine({ completedDate: day("2026-10-09"), lotNumber: " L-77 " }),
  );
  assert.deepEqual(result, { entryId, animalId, nextEntryId: null });

  const entry = await entryNow(entryId);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.dueDate, "2026-10-14");
  assert.equal(entry.completedDate, "2026-10-09");
  assert.equal(entry.source, MedicalEntrySource.IN_HOUSE);
  // In house, so the person recording it gave it.
  assert.equal(entry.administeredById, editorId);
  // Who scheduled it stays its creator.
  assert.equal(entry.createdById, staffId);
  assert.ok(entry.vaccine);
  assert.equal(entry.vaccine.lotNumber, "L-77");
  assert.equal(entry.vaccine.manufacturer, "Zoetis");
  assert.equal(entry.vaccine.route, MedicalRoute.SUBCUTANEOUS);

  const events = await eventsOf(entryId);
  assert.equal(events.length, 2);
  assert.equal(events[1].action, MedicalEntryEventAction.COMPLETED);
  assert.equal(events[1].actorId, editorId);
  assert.deepEqual(events[1].before, { status: MedicalEntryStatus.SCHEDULED });
  assert.deepEqual(events[1].after, {
    status: MedicalEntryStatus.COMPLETED,
    itemId: dhppId,
    completedDate: "2026-10-09",
    source: MedicalEntrySource.IN_HOUSE,
    vetPartnerId: null,
    vetName: null,
    administeredById: editorId,
    notes: null,
    manufacturer: "Zoetis",
    lotNumber: "L-77",
    lotExpiryDate: null,
    route: MedicalRoute.SUBCUTANEOUS,
    site: null,
    rabiesTagNumber: null,
    durationMonths: null,
    validUntilDate: null,
    veterinarianName: null,
    veterinarianLicenseNumber: null,
  });

  // Given a day early: the due day is named beside the day given.
  assert.deepEqual((await activityOf(animalId)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
    changedById: editorId,
    changeSummary: `${name("DHPP")} vaccine recorded: given in house, on Oct 9, 2026 (due Oct 14, 2026).`,
  });

  // It is now care that happened: off the due list, on the derived reads.
  assert.deepEqual(await findDueMedicalEntries(prisma, animalId), []);
  assert.deepEqual(
    (await findRecentMedicalEntries(prisma, animalId, 10)).map((row) => row.id),
    [entryId],
  );
});

test("recording a scheduled test or treatment writes its kind's details", async () => {
  const animalId = await makeAnimal("Test and treatment");
  const test = await schedule(animalId, {
    kind: MedicalEntryKind.TEST,
    itemId: snapTestId,
    dueDate: TODAY,
  });
  await recordScheduled(test.entryId, {
    kind: MedicalEntryKind.TEST,
    itemId: snapTestId,
    completedDate: TODAY,
    source: MedicalEntrySource.IN_HOUSE,
    results: [
      { analyteId: snapAnalyteIds[0], result: TestResult.NEGATIVE },
      { analyteId: snapAnalyteIds[1], result: TestResult.POSITIVE },
    ],
  });
  const tested = await entryNow(test.entryId);
  assert.deepEqual(
    tested.test?.results.map((row) => [row.analyteName, row.result]),
    [
      ["Antibody", TestResult.POSITIVE],
      ["Antigen", TestResult.NEGATIVE],
    ],
  );
  assert.equal(
    (await activityOf(animalId)).at(-1)?.changeSummary,
    `${name("Snap test")} test recorded: run in house, on Oct 10, 2026 (due Oct 10, 2026). Results: Antigen negative, Antibody positive.`,
  );

  const treatment = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    dueDate: TODAY,
  });
  await recordScheduled(treatment.entryId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    completedDate: TODAY,
    source: MedicalEntrySource.IN_HOUSE,
  });
  const treated = await entryNow(treatment.entryId);
  assert.equal(treated.treatment?.doseAmount, 2);
  assert.equal(treated.treatment?.doseUnit, DoseUnit.ML);
  assert.equal(treated.treatment?.route, MedicalRoute.ORAL);
});

test("scheduled care can be recorded by an outside vet, but not as given before intake", async () => {
  const animalId = await makeAnimal("Sources");
  const outside = await schedule(animalId);
  await recordScheduled(
    outside.entryId,
    givenVaccine({
      completedDate: TODAY,
      source: MedicalEntrySource.OUTSIDE_VET,
      vetName: "Dr. Patel",
    }),
  );
  const entry = await entryNow(outside.entryId);
  assert.equal(entry.source, MedicalEntrySource.OUTSIDE_VET);
  assert.equal(entry.administeredById, null);

  const before = await schedule(animalId);
  await refusedOn(
    recordScheduled(
      before.entryId,
      givenVaccine({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null }),
    ),
    "source",
    "Care scheduled during the animal's stay can't have been given before intake.",
  );
  // The day rules still apply.
  await refusedOn(
    recordScheduled(before.entryId, givenVaccine({ completedDate: day("2026-10-11") })),
    "completedDate",
  );
  await refusedOn(
    recordScheduled(before.entryId, givenVaccine({ completedDate: day("2026-07-31") })),
    "completedDate",
  );
  const untouched = await entryNow(before.entryId);
  assert.equal(untouched.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(untouched.vaccine, null);
  assert.equal((await eventsOf(before.entryId)).length, 1);
});

test("the item can change within its kind, and only a changed item is checked against the catalog", async () => {
  const animalId = await makeAnimal("Item change");

  // Retired after the care was scheduled, recorded unchanged: allowed.
  const laterRetired = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Retired later"),
    speciesIds: [],
    analytes: [],
  });
  const kept = await schedule(animalId, { itemId: laterRetired });
  await prisma.$transaction((tx) => retireMedicalItem(tx, laterRetired));
  await recordScheduled(kept.entryId, givenVaccine({ itemId: laterRetired }));
  assert.equal((await entryNow(kept.entryId)).status, MedicalEntryStatus.COMPLETED);

  // Changed to another live vaccine for a dog: allowed, and recorded.
  const swapped = await schedule(animalId);
  await recordScheduled(
    swapped.entryId,
    givenVaccine({ itemId: rabiesId, durationMonths: 12 }),
  );
  const swappedNow = await entryNow(swapped.entryId);
  assert.equal(swappedNow.itemId, rabiesId);
  assert.equal(swappedNow.vaccine?.durationMonths, 12);

  // Changed to a retired item, or one for another species: refused.
  const refused = await schedule(animalId);
  await refusedOn(
    recordScheduled(refused.entryId, givenVaccine({ itemId: retiredVaccineId })),
    "itemId",
  );
  await refusedOn(
    recordScheduled(refused.entryId, givenVaccine({ itemId: catVaccineId })),
    "itemId",
  );
  // And the kind can't change.
  await refusedOn(
    recordScheduled(refused.entryId, {
      kind: MedicalEntryKind.TREATMENT,
      itemId: dewormerId,
      completedDate: TODAY,
      source: MedicalEntrySource.IN_HOUSE,
    }),
    undefined,
  );
  assert.equal((await entryNow(refused.entryId)).status, MedicalEntryStatus.SCHEDULED);
});

test("only scheduled care that isn't voided can be recorded as given", async () => {
  const animalId = await makeAnimal("Record refusals");
  const completed = await schedule(animalId);
  await recordScheduled(completed.entryId, givenVaccine());
  const declined = await schedule(animalId);
  await decline(declined.entryId, "Not needed.");
  const voided = await schedule(animalId);
  await voidEntry(voided.entryId, "Duplicate.");
  const adHoc = await record(animalId, givenVaccine());

  for (const [entryId, pattern] of [
    [completed.entryId, /already been recorded as given/],
    [adHoc.entryId, /already been recorded as given/],
    [declined.entryId, /was declined, so it can't be recorded as given/],
    [voided.entryId, /was voided, so it can't be recorded as given/],
  ] as const) {
    await conflicts(recordScheduled(entryId, givenVaccine()), pattern);
  }
});

test("recording a scheduled rabies vaccine makes it the latest rabies vaccine", async () => {
  const animalId = await makeAnimal("Scheduled rabies");
  const earlier = await record(
    animalId,
    givenVaccine({ itemId: rabiesId, durationMonths: 12, completedDate: day("2026-08-02") }),
  );
  const { entryId } = await schedule(animalId, { itemId: rabiesId, dueDate: TODAY });
  assert.equal(
    (await findLatestRabiesVaccine(prisma, animalId))?.entryId,
    earlier.entryId,
  );
  await recordScheduled(
    entryId,
    givenVaccine({ itemId: rabiesId, durationMonths: 36, completedDate: TODAY }),
  );
  assert.deepEqual(await findLatestRabiesVaccine(prisma, animalId), {
    entryId,
    completedDate: "2026-10-10",
    validUntilDate: "2029-10-10",
  });
});

// ---------------------------------------------------------------------------
// Schedule the next one
// ---------------------------------------------------------------------------

test("recording ad hoc can schedule the next dose in the same transaction", async () => {
  const animalId = await makeAnimal("Next ad hoc");
  const { entryId, nextEntryId } = await record(
    animalId,
    givenVaccine({ completedDate: day("2026-10-08"), scheduleNext: { dueDate: day("2026-10-22") } }),
  );
  assert.ok(nextEntryId);

  const next = await entryNow(nextEntryId);
  assert.equal(next.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(next.itemId, dhppId);
  assert.equal(next.kind, MedicalEntryKind.VACCINE);
  assert.equal(next.dueDate, "2026-10-22");
  assert.equal(next.createdById, staffId);
  assert.equal(next.vaccine, null);
  assert.deepEqual(
    (await eventsOf(nextEntryId)).map((event) => [event.action, event.after]),
    [
      [
        MedicalEntryEventAction.CREATED,
        {
          kind: MedicalEntryKind.VACCINE,
          status: MedicalEntryStatus.SCHEDULED,
          itemId: dhppId,
          dueDate: "2026-10-22",
          notes: null,
        },
      ],
    ],
  );
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => [row.activityType, row.changeSummary]),
    [
      [
        AnimalActivityType.MEDICAL_ENTRY_RECORDED,
        `${name("DHPP")} vaccine recorded: given in house, on Oct 8, 2026.`,
      ],
      [
        AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
        `${name("DHPP")} vaccine scheduled for Oct 22, 2026.`,
      ],
    ],
  );
  assert.notEqual(entryId, nextEntryId);
});

test("recording scheduled care can schedule the next dose; the one recorded doesn't count as already scheduled", async () => {
  const animalId = await makeAnimal("Next from schedule");
  const { entryId } = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
    dueDate: TODAY,
  });
  const { nextEntryId } = await recordScheduled(entryId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
    completedDate: TODAY,
    source: MedicalEntrySource.IN_HOUSE,
    scheduleNext: { dueDate: day("2026-11-09") },
  });
  assert.ok(nextEntryId);
  assert.deepEqual(
    (await findDueMedicalEntries(prisma, animalId)).map((row) => [row.id, row.dueDate]),
    [[nextEntryId, "2026-11-09"]],
  );
  assert.deepEqual(
    (await activityOf(animalId)).slice(-2).map((row) => [row.activityType, row.changedById]),
    [
      [AnimalActivityType.MEDICAL_ENTRY_RECORDED, editorId],
      [AnimalActivityType.MEDICAL_ENTRY_SCHEDULED, editorId],
    ],
  );
});

test("the next dose is refused, and nothing written, unless the item repeats and the day is known", async () => {
  const animalId = await makeAnimal("Next refusals");
  const next = { dueDate: day("2026-10-24") };

  // No repeat interval.
  await refusedOn(
    record(animalId, {
      kind: MedicalEntryKind.TREATMENT,
      itemId: dewormerId,
      completedDate: TODAY,
      source: MedicalEntrySource.IN_HOUSE,
      scheduleNext: next,
    }),
    "scheduleNext",
    `${name("Dewormer")} doesn't repeat, so there is no next one to schedule.`,
  );
  // Given before intake on an unknown day.
  await refusedOn(
    record(
      animalId,
      givenVaccine({
        source: MedicalEntrySource.BEFORE_INTAKE,
        completedDate: null,
        scheduleNext: next,
      }),
    ),
    "scheduleNext",
    "The next one can't be scheduled from an unknown date.",
  );
  // The due-day rules, on the next one's own field.
  await refusedOn(
    record(animalId, givenVaccine({ scheduleNext: { dueDate: day("2026-10-09") } })),
    "scheduleNext.dueDate",
    "The due date can't be in the past.",
  );
  // Nothing was written: the record and the next one are one transaction.
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
  assert.deepEqual(await activityOf(animalId), []);
});

test("the next dose is refused when the item is retired or already scheduled", async () => {
  const animalId = await makeAnimal("Next blocked");

  // Already scheduled for the animal: the next one is planned.
  const open = await schedule(animalId, { dueDate: day("2026-10-30") });
  await refusedOn(
    record(animalId, givenVaccine({ scheduleNext: { dueDate: day("2026-10-24") } })),
    "scheduleNext",
    `${name("DHPP")} is already scheduled for this animal.`,
  );
  // Recording one of two scheduled doses: the other is still open.
  const first = await schedule(animalId, { dueDate: TODAY });
  await refusedOn(
    recordScheduled(
      first.entryId,
      givenVaccine({ completedDate: TODAY, scheduleNext: { dueDate: day("2026-10-24") } }),
    ),
    "scheduleNext",
  );
  // Rolled back with it: still scheduled, no details, no new event.
  const firstNow = await entryNow(first.entryId);
  assert.equal(firstNow.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(firstNow.vaccine, null);
  assert.equal((await eventsOf(first.entryId)).length, 1);
  await voidEntry(open.entryId, "Duplicate.");
  // Voided care doesn't count: now it goes through.
  const { nextEntryId } = await recordScheduled(
    first.entryId,
    givenVaccine({ completedDate: TODAY, scheduleNext: { dueDate: day("2026-10-24") } }),
  );
  assert.ok(nextEntryId);

  // Retired since it was scheduled: the dose can be recorded, but no new
  // one scheduled.
  const repeating = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Repeating, retired"),
    speciesIds: [],
    repeatIntervalDays: 30,
    analytes: [],
  });
  const scheduled = await schedule(animalId, { itemId: repeating, dueDate: TODAY });
  await prisma.$transaction((tx) => retireMedicalItem(tx, repeating));
  await refusedOn(
    recordScheduled(
      scheduled.entryId,
      givenVaccine({
        itemId: repeating,
        completedDate: TODAY,
        scheduleNext: { dueDate: day("2026-11-09") },
      }),
    ),
    "scheduleNext",
    `${name("Repeating, retired")} has been retired from the catalog, so the next one can't be scheduled.`,
  );
  await recordScheduled(
    scheduled.entryId,
    givenVaccine({ itemId: repeating, completedDate: TODAY }),
  );
  assert.equal((await entryNow(scheduled.entryId)).status, MedicalEntryStatus.COMPLETED);
});

test("care scheduled before the animal left can still be cleared, but not moved, and nothing new scheduled", async () => {
  const animalId = await makeAnimal("Left with care due");
  const toReschedule = await schedule(animalId);
  const toDecline = await schedule(animalId);
  // Another item, so the DHPP still open doesn't count as its next dose.
  const toRecord = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
    dueDate: TODAY,
  });
  const given = {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
    completedDate: TODAY,
    source: MedicalEntrySource.IN_HOUSE,
  } as const;
  const toVoid = await schedule(animalId);
  // The outcome that archived it is not this file's subject; only the
  // listing status is read by the entry rules.
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  // Moving it plans care the animal can't have now: refused, nothing written.
  await refusedOn(
    reschedule(toReschedule.entryId, day("2026-10-20")),
    undefined,
    "This animal has left the shelter's care, so its scheduled care can't be rescheduled. Decline or void it instead.",
  );
  const unmoved = await entryNow(toReschedule.entryId);
  assert.equal(unmoved.dueDate, "2026-10-14");
  assert.equal((await eventsOf(toReschedule.entryId)).length, 1);
  assert.equal(
    (await activityOf(animalId)).filter(
      (row) => row.activityType === AnimalActivityType.MEDICAL_ENTRY_RESCHEDULED,
    ).length,
    0,
  );
  await decline(toDecline.entryId, "Transferred out before it was due.");
  await voidEntry(toVoid.entryId, "Entered twice.");

  // Asking for the next dose schedules new care, which an animal out of care
  // can't have: refused, and the record goes with it.
  await refusedOn(
    recordScheduled(toRecord.entryId, {
      ...given,
      scheduleNext: { dueDate: day("2026-11-09") },
    }),
    undefined,
    "This animal has left the shelter's care, so nothing can be scheduled for it.",
  );
  const rolledBack = await entryNow(toRecord.entryId);
  assert.equal(rolledBack.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(rolledBack.treatment, null);
  assert.equal((await eventsOf(toRecord.entryId)).length, 1);

  await recordScheduled(toRecord.entryId, given);

  // Back in care, as an outcome reversal leaves it: the same care moves.
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.DRAFT },
  });
  await reschedule(toReschedule.entryId, day("2026-10-20"));

  const rows = await prisma.medicalEntry.findMany({
    where: { animalId },
    select: { id: true, status: true, dueDate: true, voidedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get(toReschedule.entryId)?.dueDate, "2026-10-20");
  assert.equal(byId.get(toDecline.entryId)?.status, MedicalEntryStatus.DECLINED);
  assert.equal(byId.get(toRecord.entryId)?.status, MedicalEntryStatus.COMPLETED);
  assert.ok(byId.get(toVoid.entryId)?.voidedAt);
  assert.equal(rows.length, 4);
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

test("the entry forms' items carry the animal's open scheduled care, and keep an item retired since", async () => {
  const animalId = await makeAnimal("Form items");
  const open = await schedule(animalId);
  const voided = await schedule(animalId, { dueDate: day("2026-10-20") });
  await voidEntry(voided.entryId, "Duplicate.");
  const declined = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
  });
  await decline(declined.entryId, "Not needed.");
  const given = await schedule(animalId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
  });
  await recordScheduled(given.entryId, {
    kind: MedicalEntryKind.TREATMENT,
    itemId: selamectinId,
    completedDate: TODAY,
    source: MedicalEntrySource.IN_HOUSE,
  });
  // Scheduled, then retired: it can't be picked, but its care is still
  // recorded with it.
  const lastStockId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Last stock"),
    speciesIds: [],
    analytes: [],
  });
  const lastStock = await schedule(animalId, { itemId: lastStockId });
  await prisma.$transaction((tx) => retireMedicalItem(tx, lastStockId));

  const { items, scheduledItems } = await findMedicalEntryFormItems(prisma, {
    id: animalId,
    speciesId: dogId,
  });
  const entriesOf = (itemId: string) =>
    items.find((item) => item.id === itemId)?.scheduledEntryIds;
  // Only open care counts: not voided, declined or given.
  assert.deepEqual(entriesOf(dhppId), [open.entryId]);
  assert.deepEqual(entriesOf(dewormerId), []);
  assert.deepEqual(entriesOf(selamectinId), []);
  // Not pickable: retired, or for another species.
  for (const itemId of [lastStockId, retiredVaccineId, catVaccineId]) {
    assert.equal(entriesOf(itemId), undefined);
  }
  assert.deepEqual(
    scheduledItems.map((item) => [item.id, item.scheduledEntryIds]),
    [[lastStockId, [lastStock.entryId]]],
  );
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
    findMedicalHistoryPage(prisma, animalId, {
      kinds,
      page: pageNumber,
      perPage,
      timeZone: "UTC",
    });

  const all = await page(10);
  assert.deepEqual(
    historyEntries(all).map((entry) => entry.id),
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
    historyEntries(second).map((entry) => entry.id),
    [soon.entryId, today.entryId, dueToday.entryId],
  );
  assert.equal(second.totalPages, 3);

  // The page count follows the filter too: 7 vaccines make 3 pages of 3.
  const vaccines = await page(3, 3, [MedicalEntryKind.VACCINE]);
  assert.deepEqual(
    historyEntries(vaccines).map((entry) => entry.id),
    [unknownDay.entryId],
  );
  assert.equal(vaccines.totalPages, 3);
  const treatments = await page(1, 1, [MedicalEntryKind.TREATMENT]);
  assert.deepEqual(
    historyEntries(treatments).map((entry) => entry.id),
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

// ---------------------------------------------------------------------------
// The lock
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

test("a reschedule waits for a decline of the same entry, then is refused", async () => {
  const animalId = await makeAnimal("Decline race");
  const { entryId } = await schedule(animalId);

  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  // A decline holding the animal's lock while it writes.
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      await declineMedicalEntry(tx, entryId, "Not needed.", staffId);
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const second = reschedule(entryId, day("2026-10-20"), { timeout });
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
  // It read the entry after the decline committed, so it found it declined.
  await conflicts(second, /was declined, so it can't be rescheduled/);

  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(entry.status, MedicalEntryStatus.DECLINED);
  assert.equal(entry.dueDate, "2026-10-14");
  assert.deepEqual(
    (await eventsOf(entryId)).map((event) => event.action),
    [MedicalEntryEventAction.CREATED, MedicalEntryEventAction.DECLINED],
  );
});
