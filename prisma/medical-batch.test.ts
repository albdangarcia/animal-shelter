// Batch entry, against a real Postgres: one vaccine or treatment for several
// animals at once, given or scheduled, and several scheduled entries recorded
// as given together. A batch is only as good as the rows it leaves (each
// animal's entry, event and activity row), and the rows it doesn't leave when
// any animal is refused.
//
// `medical-batch.ts` is the whole of each batch action bar the session check
// and the cache invalidation, so driving it is driving the actions.
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
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
} from "@/prisma/generated/enums";
import {
  MedicalBatchRefusal,
  recordMedicalBatch,
  recordScheduledMedicalBatch,
  type MedicalBatchGiven,
  type MedicalBatchInput,
  type MedicalScheduledBatchInput,
} from "@/app/lib/services/medical-batch";
import {
  MedicalEntryRefusal,
  declineMedicalEntry,
  scheduleMedicalEntry,
} from "@/app/lib/services/medical-entry";
import {
  createMedicalItem,
  type MedicalItemInput,
} from "@/app/lib/services/medical-catalog";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  MAX_BATCH_SIZE,
  type CatalogEntryKind,
} from "@/app/lib/constants/medical";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

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

let rabiesId: string;
let dhppId: string;
let dewormerId: string;
let praziquantelId: string;
let snapTestId: string;

const name = (label: string) => `${label} ${runId}`;

const createItem = async (input: MedicalItemInput) =>
  (await prisma.$transaction((tx) => createMedicalItem(tx, input))).id;

before(async () => {
  const species = async (label: string) =>
    (
      await prisma.species.create({
        data: { name: `Batch ${label} ${runId}` },
        select: { id: true },
      })
    ).id;
  dogId = await species("dog");
  catId = await species("cat");
  colorId = (
    await prisma.color.create({
      data: { name: `Batch color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Batch staff ${runId}` },
      select: { id: true },
    })
  ).id;

  rabiesId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Rabies"),
    speciesIds: [dogId, catId],
    defaultRoute: MedicalRoute.SUBCUTANEOUS,
    isRabies: true,
    analytes: [],
  });
  dhppId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("DHPP"),
    speciesIds: [dogId],
    defaultRoute: MedicalRoute.SUBCUTANEOUS,
    repeatIntervalDays: 14,
    analytes: [],
  });
  dewormerId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Dewormer"),
    speciesIds: [],
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseUnit: DoseUnit.ML,
    repeatIntervalDays: 14,
    analytes: [],
  });
  praziquantelId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Praziquantel"),
    speciesIds: [],
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseUnit: DoseUnit.TABLET,
    analytes: [],
  });
  snapTestId = await createItem({
    kind: MedicalItemKind.TEST,
    name: name("Snap test"),
    speciesIds: [],
    analytes: [{ name: "Antigen" }],
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
  await prisma.person.deleteMany({ where: { id: staffId } });
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
        sex: Sex.MALE,
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

const makeAnimals = (label: string, count: number) =>
  Promise.all(
    Array.from({ length: count }, (_, i) => makeAnimal(`${label} ${i + 1}`)),
  );

const batch = (
  input: MedicalBatchInput,
  options?: { timeout: number },
) =>
  prisma.$transaction(
    (tx) => recordMedicalBatch(tx, input, staffId, TODAY),
    options,
  );

const scheduledBatch = (input: MedicalScheduledBatchInput) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalBatch(tx, input, staffId, TODAY),
  );

const dewormerGiven = (
  overrides: Partial<MedicalBatchGiven> = {},
): MedicalBatchGiven =>
  ({
    kind: MedicalEntryKind.TREATMENT,
    itemId: dewormerId,
    completedDate: day("2026-10-09"),
    source: MedicalEntrySource.IN_HOUSE,
    doseAmount: 3,
    doseUnit: DoseUnit.ML,
    ...overrides,
  }) as MedicalBatchGiven;

const giveDewormer = (
  animalIds: string[],
  overrides: Partial<MedicalBatchGiven> = {},
) =>
  batch({
    mode: "RECORD",
    animals: animalIds.map((animalId) => ({ animalId })),
    entry: dewormerGiven(overrides),
  });

const schedule = (
  animalId: string,
  itemId: string,
  kind: CatalogEntryKind = MedicalEntryKind.TREATMENT,
  dueDate: CalendarDay = day("2026-10-12"),
) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(tx, { animalId, kind, itemId, dueDate }, staffId, TODAY),
  );

const entriesOf = (animalIds: string[]) =>
  prisma.medicalEntry.findMany({
    where: { animalId: { in: animalIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      animalId: true,
      itemId: true,
      status: true,
      dueDate: true,
      completedDate: true,
      notes: true,
      batchId: true,
      treatment: { select: { doseAmount: true, doseUnit: true } },
      vaccine: { select: { rabiesTagNumber: true, durationMonths: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: { action: true, after: true },
      },
    },
  });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    select: { activityType: true, changeSummary: true },
  });

/** Asserts `promise` is refused as a batch, and returns its refusals. */
const batchRefusals = async (promise: Promise<unknown>) => {
  let refusal: MedicalBatchRefusal | undefined;
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof MedicalBatchRefusal);
    refusal = error;
    return true;
  });
  return refusal!.refusals;
};

// --- Given and scheduled in one go -----------------------------------------

test("a batch gives each animal its own entry, event and activity row, sharing one batch id", async () => {
  const animalIds = await makeAnimals("Kennel row", 3);

  const result = await giveDewormer(animalIds);

  assert.equal(result.entries.length, 3);
  const entries = await entriesOf(animalIds);
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.animalId).sort(),
    [...animalIds].sort(),
  );
  for (const entry of entries) {
    assert.equal(entry.batchId, result.batchId);
    assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
    assert.equal(entry.completedDate, "2026-10-09");
    assert.deepEqual(entry.treatment, { doseAmount: 3, doseUnit: DoseUnit.ML });
    assert.equal(entry.events.length, 1);
    assert.equal(entry.events[0].action, MedicalEntryEventAction.CREATED);
    assert.equal(
      (entry.events[0].after as { batchId?: string }).batchId,
      result.batchId,
    );
  }
  for (const animalId of animalIds) {
    assert.deepEqual(await activityOf(animalId), [
      {
        activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
        changeSummary: `${name("Dewormer")} treatment recorded: given in house, on Oct 9, 2026. Part of a batch of 3 animals.`,
      },
    ]);
  }
});

test("a batch can schedule care for every animal, with one due day", async () => {
  const animalIds = await makeAnimals("Litter", 2);

  const result = await batch({
    mode: "SCHEDULE",
    animals: animalIds.map((animalId) => ({ animalId })),
    entry: {
      kind: MedicalEntryKind.VACCINE,
      itemId: dhppId,
      dueDate: day("2026-10-20"),
      notes: "First booster.",
    },
  });

  const entries = await entriesOf(animalIds);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
    assert.equal(entry.dueDate, "2026-10-20");
    assert.equal(entry.notes, "First booster.");
    assert.equal(entry.batchId, result.batchId);
    assert.equal(entry.vaccine, null);
    assert.equal(
      (entry.events[0].after as { batchId?: string }).batchId,
      result.batchId,
    );
  }
  assert.deepEqual(await activityOf(animalIds[0]), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
      changeSummary: `${name("DHPP")} vaccine scheduled for Oct 20, 2026. Part of a batch of 2 animals.`,
    },
  ]);
});

test("a rabies vaccine shares its duration, and each animal carries its own tag", async () => {
  const [first, second] = await makeAnimals("Rabies clinic", 2);

  await batch({
    mode: "RECORD",
    animals: [
      { animalId: first, rabiesTagNumber: " R-501 " },
      { animalId: second },
    ],
    entry: {
      kind: MedicalEntryKind.VACCINE,
      itemId: rabiesId,
      completedDate: day("2026-10-09"),
      source: MedicalEntrySource.IN_HOUSE,
      durationMonths: 12,
    },
  });

  const entries = await entriesOf([first, second]);
  const tagOf = (animalId: string) =>
    entries.find((entry) => entry.animalId === animalId)?.vaccine;
  assert.deepEqual(tagOf(first), { rabiesTagNumber: "R-501", durationMonths: 12 });
  assert.deepEqual(tagOf(second), { rabiesTagNumber: null, durationMonths: 12 });
});

// --- Refusals ---------------------------------------------------------------

test("one refused animal writes nothing for any, and every refused animal is named", async () => {
  const dogs = await makeAnimals("Mixed room dog", 2);
  const cat = await makeAnimal("Mixed room cat", { speciesId: catId });
  const gone = await makeAnimal("Mixed room gone", {
    listingStatus: AnimalListingStatus.ARCHIVED,
  });

  // A dog vaccine for a cat.
  const given = await batchRefusals(
    batch({
      mode: "RECORD",
      animals: [...dogs, cat].map((animalId) => ({ animalId })),
      entry: {
        kind: MedicalEntryKind.VACCINE,
        itemId: dhppId,
        completedDate: day("2026-10-09"),
        source: MedicalEntrySource.IN_HOUSE,
      },
    }),
  );
  assert.deepEqual(given, [
    {
      animalId: cat,
      animalName: name("Mixed room cat"),
      message: `${name("DHPP")} isn't for this animal's species.`,
    },
  ]);

  // Scheduling for an animal that has left, and for the cat.
  const scheduled = await batchRefusals(
    batch({
      mode: "SCHEDULE",
      animals: [...dogs, gone, cat].map((animalId) => ({ animalId })),
      entry: {
        kind: MedicalEntryKind.VACCINE,
        itemId: dhppId,
        dueDate: day("2026-10-20"),
      },
    }),
  );
  assert.deepEqual(
    scheduled.map((refusal) => [refusal.animalName, refusal.message]),
    [
      [
        name("Mixed room gone"),
        "This animal has left the shelter's care, so nothing can be scheduled for it.",
      ],
      [name("Mixed room cat"), `${name("DHPP")} isn't for this animal's species.`],
    ],
  );

  assert.deepEqual(await entriesOf([...dogs, cat, gone]), []);
  for (const animalId of dogs) {
    assert.deepEqual(await activityOf(animalId), []);
  }
});

test("tests aren't batched, given or scheduled", async () => {
  const animalIds = await makeAnimals("Snap test", 2);

  for (const input of [
    {
      mode: "SCHEDULE",
      animals: animalIds.map((animalId) => ({ animalId })),
      entry: {
        kind: MedicalEntryKind.TEST,
        itemId: snapTestId,
        dueDate: day("2026-10-20"),
      },
    },
    {
      mode: "RECORD",
      animals: animalIds.map((animalId) => ({ animalId })),
      entry: {
        kind: MedicalEntryKind.TEST,
        itemId: snapTestId,
        completedDate: day("2026-10-09"),
        source: MedicalEntrySource.IN_HOUSE,
        results: [],
      },
    },
  ] as unknown as MedicalBatchInput[]) {
    await assert.rejects(batch(input), (error) => {
      assert.ok(error instanceof MedicalEntryRefusal);
      assert.equal(error.field, "kind");
      return true;
    });
  }
  assert.deepEqual(await entriesOf(animalIds), []);
});

test("care given in a batch isn't before intake", async () => {
  const animalIds = await makeAnimals("Paperwork", 2);

  await assert.rejects(
    giveDewormer(animalIds, { source: MedicalEntrySource.BEFORE_INTAKE }),
    (error) => {
      assert.ok(error instanceof MedicalEntryRefusal);
      assert.equal(error.field, "source");
      return true;
    },
  );
  assert.deepEqual(await entriesOf(animalIds), []);
});

test(`a batch covers one to ${MAX_BATCH_SIZE} animals, each once`, async () => {
  const [animalId] = await makeAnimals("Counted", 1);
  // Refused before any animal is read, so the ids needn't exist.
  const many = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => randomUUID());

  for (const [animalIds, message] of [
    [[], "Pick at least one animal."],
    [
      many,
      `A batch can cover at most ${MAX_BATCH_SIZE} animals. Split it into smaller batches.`,
    ],
    [[animalId, animalId], "An animal is listed more than once."],
  ] as const) {
    await assert.rejects(giveDewormer([...animalIds]), (error) => {
      assert.ok(error instanceof MedicalEntryRefusal);
      assert.equal(error.field, "animals");
      assert.equal(error.message, message);
      return true;
    });
  }
  assert.deepEqual(await entriesOf([animalId]), []);
});

// --- Schedule the next one --------------------------------------------------

test("the next dose is scheduled for each animal that doesn't already have one planned", async () => {
  const [fresh, planned] = await makeAnimals("Next dose", 2);
  const open = await schedule(planned, dewormerId, MedicalEntryKind.TREATMENT, day("2026-10-15"));

  const result = await batch({
    mode: "RECORD",
    animals: [{ animalId: fresh }, { animalId: planned }],
    entry: dewormerGiven(),
    scheduleNext: { dueDate: day("2026-10-23") },
  });

  const nextOf = (animalId: string) =>
    result.entries.find((entry) => entry.animalId === animalId)?.nextEntryId;
  assert.ok(nextOf(fresh));
  assert.equal(nextOf(planned), null);

  const freshEntries = await entriesOf([fresh]);
  assert.deepEqual(
    freshEntries.map((entry) => [entry.status, entry.dueDate, entry.batchId]),
    [
      [MedicalEntryStatus.COMPLETED, null, result.batchId],
      [MedicalEntryStatus.SCHEDULED, "2026-10-23", result.batchId],
    ],
  );
  // The animal that had one planned keeps only that one open.
  const plannedOpen = (await entriesOf([planned])).filter(
    (entry) => entry.status === MedicalEntryStatus.SCHEDULED,
  );
  assert.deepEqual(
    plannedOpen.map((entry) => entry.id),
    [open.entryId],
  );
  assert.equal(
    (await activityOf(fresh)).at(-1)?.changeSummary,
    `${name("Dewormer")} treatment scheduled for Oct 23, 2026. Part of a batch of 2 animals.`,
  );
});

// --- Recording scheduled care together --------------------------------------

test("scheduled entries for one item are recorded as given with the same details, keeping their notes", async () => {
  const [first, second] = await makeAnimals("Due row", 2);
  const a = await schedule(first, dewormerId);
  const b = await schedule(second, dewormerId);
  await prisma.medicalEntry.update({
    where: { id: a.entryId },
    data: { notes: "Give with food." },
  });

  const result = await scheduledBatch({
    entries: [{ entryId: a.entryId }, { entryId: b.entryId }],
    details: {
      kind: MedicalEntryKind.TREATMENT,
      completedDate: day("2026-10-10"),
      source: MedicalEntrySource.IN_HOUSE,
      doseAmount: 2.5,
      doseUnit: DoseUnit.ML,
      notes: null,
    },
  });

  const entries = await entriesOf([first, second]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const id of [a.entryId, b.entryId]) {
    const entry = byId.get(id)!;
    assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
    assert.equal(entry.dueDate, "2026-10-12");
    assert.equal(entry.completedDate, "2026-10-10");
    assert.deepEqual(entry.treatment, { doseAmount: 2.5, doseUnit: DoseUnit.ML });
    assert.equal(entry.batchId, result.batchId);
    const completed = entry.events.at(-1)!;
    assert.equal(completed.action, MedicalEntryEventAction.COMPLETED);
    assert.equal((completed.after as { batchId?: string }).batchId, result.batchId);
  }
  // Notes left empty keep each entry's own.
  assert.equal(byId.get(a.entryId)!.notes, "Give with food.");
  assert.equal(byId.get(b.entryId)!.notes, null);
  assert.equal(
    (await activityOf(first)).at(-1)?.changeSummary,
    `${name("Dewormer")} treatment recorded: given in house, on Oct 10, 2026 (due Oct 12, 2026). Part of a batch of 2 animals.`,
  );
});

test("notes given to a batch of scheduled entries replace each entry's", async () => {
  const [animalId] = await makeAnimals("Noted", 1);
  const { entryId } = await schedule(animalId, praziquantelId);
  await prisma.medicalEntry.update({
    where: { id: entryId },
    data: { notes: "Planned note." },
  });

  await scheduledBatch({
    entries: [{ entryId }],
    details: {
      kind: MedicalEntryKind.TREATMENT,
      completedDate: day("2026-10-10"),
      source: MedicalEntrySource.IN_HOUSE,
      notes: "Given in the yard.",
    },
  });

  assert.equal((await entriesOf([animalId]))[0].notes, "Given in the yard.");
});

test("scheduled entries for different items, or tests, aren't recorded together", async () => {
  const [first, second] = await makeAnimals("Mixed due", 2);
  const dewormer = await schedule(first, dewormerId);
  const praziquantel = await schedule(second, praziquantelId);

  await assert.rejects(
    scheduledBatch({
      entries: [{ entryId: dewormer.entryId }, { entryId: praziquantel.entryId }],
      details: {
        kind: MedicalEntryKind.TREATMENT,
        completedDate: day("2026-10-10"),
        source: MedicalEntrySource.IN_HOUSE,
      },
    }),
    (error) => {
      assert.ok(error instanceof MedicalEntryRefusal);
      assert.equal(error.field, "entries");
      assert.match(error.message, /different items/);
      return true;
    },
  );

  const test = await schedule(first, snapTestId, MedicalEntryKind.TEST);
  await assert.rejects(
    scheduledBatch({
      entries: [{ entryId: test.entryId }],
      details: {
        kind: MedicalEntryKind.TEST,
        completedDate: day("2026-10-10"),
        source: MedicalEntrySource.IN_HOUSE,
      },
    } as unknown as MedicalScheduledBatchInput),
    (error) => error instanceof MedicalEntryRefusal && error.field === "kind",
  );

  const open = (await entriesOf([first, second])).filter(
    (entry) => entry.status === MedicalEntryStatus.SCHEDULED,
  );
  assert.equal(open.length, 3);
});

test("an entry declined since it was picked refuses the batch, naming its animal", async () => {
  const [first, second] = await makeAnimals("Declined since", 2);
  const a = await schedule(first, dewormerId);
  const b = await schedule(second, dewormerId);
  await prisma.$transaction((tx) =>
    declineMedicalEntry(tx, b.entryId, "Vomiting this morning.", staffId),
  );

  const refusals = await batchRefusals(
    scheduledBatch({
      entries: [{ entryId: a.entryId }, { entryId: b.entryId }],
      details: {
        kind: MedicalEntryKind.TREATMENT,
        completedDate: day("2026-10-10"),
        source: MedicalEntrySource.IN_HOUSE,
      },
    }),
  );
  assert.deepEqual(refusals, [
    {
      animalId: second,
      animalName: name("Declined since 2"),
      entryId: b.entryId,
      message: "This entry was declined, so it can't be recorded as given.",
    },
  ]);
  // The first entry, recorded before the refusal, is rolled back with it.
  const [rolledBack] = await entriesOf([first]);
  assert.equal(rolledBack.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(rolledBack.batchId, null);
});

test("of two scheduled entries for one item on one animal, the last recorded schedules the next", async () => {
  const [animalId, other] = await makeAnimals("Doubled", 2);
  const a = await schedule(animalId, dewormerId, MedicalEntryKind.TREATMENT, day("2026-10-11"));
  const b = await schedule(animalId, dewormerId, MedicalEntryKind.TREATMENT, day("2026-10-12"));
  const c = await schedule(other, dewormerId);

  const result = await scheduledBatch({
    entries: [{ entryId: a.entryId }, { entryId: b.entryId }, { entryId: c.entryId }],
    details: {
      kind: MedicalEntryKind.TREATMENT,
      completedDate: day("2026-10-10"),
      source: MedicalEntrySource.IN_HOUSE,
    },
    scheduleNext: { dueDate: day("2026-10-24") },
  });

  assert.deepEqual(
    result.entries.map((entry) => [entry.entryId, !!entry.nextEntryId]),
    [
      [a.entryId, false],
      [b.entryId, true],
      [c.entryId, true],
    ],
  );
  const open = (await entriesOf([animalId])).filter(
    (entry) => entry.status === MedicalEntryStatus.SCHEDULED,
  );
  assert.deepEqual(
    open.map((entry) => entry.dueDate),
    ["2026-10-24"],
  );
  // Two animals, though three entries.
  assert.match(
    (await activityOf(other)).at(-2)?.changeSummary ?? "",
    /Part of a batch of 2 animals\.$/,
  );
});

// --- Two batches at once ----------------------------------------------------

// Longer than the five seconds `waitForSessionsQueuedBehind` may take, so a slow
// machine fails on the wait, not on a transaction timeout.
const lockWaitTimeout = 20_000;

const heldOpen = new Set<{ release: () => void; done: Promise<void> }>();

/** Runs `work` in a transaction kept open, holding its locks, until
 * `release` is called. */
const holdOpen = async <T>(work: (tx: TransactionClient) => Promise<T>) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (value: T) => void;
  const isHeld = new Promise<T>((resolve) => (held = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      held(await work(tx));
      await released;
    },
    { timeout: lockWaitTimeout },
  );
  const entry = { release, done };
  heldOpen.add(entry);
  void done.finally(() => heldOpen.delete(entry)).catch(() => {});
  const result = await Promise.race([isHeld, done as Promise<never>]);
  return { result, release, done };
};

afterEach(async () => {
  const open = [...heldOpen];
  for (const { release } of open) release();
  await Promise.allSettled(open.map(({ done }) => done));
});

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// Sessions waiting on `holderPid`'s lock. The first to wait on a row lock is
// blocked by the holder; the next queue behind that first waiter, so they
// are counted through it. Asking which sessions the holder holds up keeps
// another test file's wait on some other animal from counting for this one.
const waitForSessionsQueuedBehind = async (holderPid: number, count: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      WITH direct AS (
        SELECT pid FROM pg_stat_activity
        WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))
      )
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE pid IN (SELECT pid FROM direct)
         OR pg_blocking_pids(pid) && ARRAY(SELECT pid FROM direct)`;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Fewer than ${count} sessions were seen waiting on ${holderPid}.`);
};

test("two batches over the same animals, listed in opposite orders, both finish", async () => {
  const animalIds = await makeAnimals("Overlap", 3);
  const [lowest] = [...animalIds].sort();

  // Holds the animal both batches lock first, so both are waiting on it at
  // once. Were the locks taken in the order listed, one batch would hold the
  // others by then, and the two would deadlock once it is released.
  const holder = await holdOpen(async (tx) => {
    await lockAnimal(tx, lowest);
    return backendPid(tx);
  });

  const forward = batch(
    {
      mode: "RECORD",
      animals: animalIds.map((animalId) => ({ animalId })),
      entry: dewormerGiven(),
    },
    { timeout: lockWaitTimeout },
  );
  const backward = batch(
    {
      mode: "SCHEDULE",
      animals: [...animalIds].reverse().map((animalId) => ({ animalId })),
      entry: {
        kind: MedicalEntryKind.TREATMENT,
        itemId: praziquantelId,
        dueDate: day("2026-10-20"),
      },
    },
    { timeout: lockWaitTimeout },
  );
  const both = Promise.allSettled([forward, backward]);
  await waitForSessionsQueuedBehind(holder.result, 2);

  holder.release();
  await holder.done;
  const [first, second] = await both;
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "fulfilled");
  assert.equal((await entriesOf(animalIds)).length, 6);
});

for (const scheduled of [false, true]) test(`${scheduled ? "scheduled" : "ad hoc"} rabies batch stores shared credentials in every entry and snapshot`, async () => {
  const animals = await makeAnimals("Shared veterinarian", 2);
  const entry = { kind: MedicalEntryKind.VACCINE, itemId: rabiesId, completedDate: day("2026-10-09"), source: MedicalEntrySource.IN_HOUSE, durationMonths: 12, veterinarianName: " Dr Batch ", veterinarianLicenseNumber: " B-12 " } as const;
  const plans = scheduled ? await Promise.all(animals.map((id) => schedule(id, rabiesId, MedicalEntryKind.VACCINE))) : [];
  const result = scheduled
    ? await scheduledBatch({ entries: plans.map((p) => ({ entryId: p.entryId })), details: entry })
    : await batch({ mode: "RECORD", animals: animals.map((animalId) => ({ animalId })), entry });
  for (const { entryId } of result.entries) {
    const row = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { vaccine: true, events: { orderBy: { createdAt: "asc" } } } });
    assert.equal(row.vaccine!.veterinarianName, "Dr Batch");
    assert.equal(row.vaccine!.veterinarianLicenseNumber, "B-12");
    assert.equal((row.events.at(-1)!.after as Record<string, unknown>).veterinarianLicenseNumber, "B-12");
  }
});

test("invalid shared veterinarian credentials refuse a batch without entries or activity", async () => {
  const animals = await makeAnimals("Refused veterinarian", 2);
  await assert.rejects(batch({ mode: "RECORD", animals: animals.map((animalId) => ({ animalId })), entry: { kind: MedicalEntryKind.VACCINE, itemId: rabiesId, completedDate: TODAY, source: MedicalEntrySource.IN_HOUSE, durationMonths: 12, veterinarianLicenseNumber: "x".repeat(101) } }), MedicalBatchRefusal);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: { in: animals } } }), 0);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId: { in: animals } } }), 0);
});
