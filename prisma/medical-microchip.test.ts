// Microchips in the medical record, against a real Postgres: recorded,
// scheduled, corrected and voided through the entry service, as the actions
// drive it. A chip has no catalog item; its number says which chip it is, is
// stored normalised, and is held by one entry that isn't voided at a time.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  Sex,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  ChipNumberClash,
  nameChipNumberHolder,
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type MicrochipEntryInput,
  type RecordMedicalEntryInput,
} from "@/app/lib/services/medical-entry";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { findCurrentChips } from "@/app/lib/data/animals/medical-status";
import { animalSearchWhere } from "@/app/lib/data/search/global-search";

// Random, not the time: the files run in parallel.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;

const name = (label: string) => `${label} ${runId}`;

// A chip number no other test file or run uses: nine letters or digits from
// the run, then a counter. Numbers are unique across the whole table, so a
// fixed one would clash between runs against one database.
let chips = 0;
const chipNumber = () => {
  chips += 1;
  return `${runId}${String(chips).padStart(6, "0")}`.toUpperCase().slice(0, 15);
};

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Chip species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Chip color") },
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
  staffId = await person("Chip staff");
  editorId = await person("Chip editor");
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
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

const microchip = (
  overrides: Partial<MicrochipEntryInput> = {},
): MicrochipEntryInput => ({
  kind: MedicalEntryKind.MICROCHIP,
  chipNumber: chipNumber(),
  completedDate: day("2026-10-03"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const record = (animalId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY),
  );

const edit = (entryId: string, input: MicrochipEntryInput) =>
  prisma.$transaction((tx) => editMedicalEntry(tx, entryId, input, editorId, TODAY));

const voidEntry = (entryId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, editorId));

const entryOf = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { microchip: true },
  });

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
          AnimalActivityType.MEDICAL_ENTRY_EDITED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changeSummary: true },
  });

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

test("a chip implanted in house stores its number normalised, its brand and who implanted it", async () => {
  const animalId = await makeAnimal("In house");
  const number = chipNumber();
  // Typed in groups, in lower case.
  const typed = `${number.slice(0, 5)} ${number.slice(5, 10)}-${number.slice(10)}`.toLowerCase();
  const { entryId, nextEntryId } = await record(
    animalId,
    microchip({ chipNumber: typed, brand: " HomeAgain " }),
  );
  assert.equal(nextEntryId, null);

  const entry = await entryOf(entryId);
  assert.equal(entry.kind, MedicalEntryKind.MICROCHIP);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.chipNumber, number);
  assert.equal(entry.itemId, null);
  assert.equal(entry.procedure, null);
  assert.equal(entry.completedDate, "2026-10-03");
  assert.equal(entry.source, MedicalEntrySource.IN_HOUSE);
  // In house, whoever recorded it implanted it, as for any care given here.
  assert.equal(entry.administeredById, staffId);
  assert.equal(entry.microchip?.brand, "HomeAgain");

  const [created] = await eventsOf(entryId);
  assert.equal(created.action, MedicalEntryEventAction.CREATED);
  assert.deepEqual(created.after, {
    kind: MedicalEntryKind.MICROCHIP,
    status: MedicalEntryStatus.COMPLETED,
    itemId: null,
    completedDate: "2026-10-03",
    source: MedicalEntrySource.IN_HOUSE,
    vetPartnerId: null,
    vetName: null,
    administeredById: staffId,
    notes: null,
    chipNumber: number,
    brand: "HomeAgain",
    registrationStatus: "UNKNOWN",
    registryName: null,
    registrationDate: null,
    registrationNotes: null,
  });
  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changeSummary: `Microchip ${number} recorded: implanted in house, on Oct 3, 2026.`,
    },
  ]);
});

test("a chip found on a scan before intake is recorded with an unknown day", async () => {
  const animalId = await makeAnimal("Found");
  const number = chipNumber();
  const { entryId } = await record(
    animalId,
    microchip({
      chipNumber: number,
      source: MedicalEntrySource.BEFORE_INTAKE,
      completedDate: null,
    }),
  );
  const entry = await entryOf(entryId);
  assert.equal(entry.completedDate, null);
  assert.equal(entry.administeredById, null);
  assert.equal(entry.microchip?.brand, null);
  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changeSummary: `Microchip ${number} recorded: found before intake, on an unknown date.`,
    },
  ]);
});

test("a number a chip can't carry is refused, and nothing is written", async () => {
  const animalId = await makeAnimal("Bad number");
  await refusedOn(
    record(animalId, microchip({ chipNumber: "1234" })),
    "chipNumber",
    /9 to 15 letters or digits/,
  );
  await refusedOn(
    record(animalId, microchip({ chipNumber: "98514100.010003" })),
    "chipNumber",
    /only letters and digits/,
  );
  await refusedOn(
    record(animalId, microchip({ chipNumber: " - " })),
    "chipNumber",
    /required/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
});

test("an animal can carry a second chip, but no number twice", async () => {
  const animalId = await makeAnimal("Two chips");
  const first = chipNumber();
  await record(animalId, microchip({ chipNumber: first }));
  await record(
    animalId,
    microchip({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null }),
  );
  assert.equal(
    await prisma.medicalEntry.count({
      where: { animalId, kind: MedicalEntryKind.MICROCHIP, voidedAt: null },
    }),
    2,
  );
  await refusedOn(
    record(animalId, microchip({ chipNumber: first.toLowerCase() })),
    "chipNumber",
    /^That chip number is already on this animal's record\.$/,
  );
});

test("a number on another animal is refused, naming that animal", async () => {
  const holderId = await makeAnimal("Holder");
  const otherId = await makeAnimal("Other");
  const number = chipNumber();
  await record(holderId, microchip({ chipNumber: number }));

  await refusedOn(
    record(otherId, microchip({ chipNumber: number })),
    "chipNumber",
    new RegExp(`^That chip number is already on Holder ${runId}'s record\\.$`),
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: otherId } }), 0);
});

test("a voided chip's number can be used again", async () => {
  const mistypedOn = await makeAnimal("Mistyped");
  const rightOn = await makeAnimal("Right one");
  const number = chipNumber();
  const { entryId } = await record(mistypedOn, microchip({ chipNumber: number }));
  await voidEntry(entryId, "Number belongs to another animal.");

  const again = await record(rightOn, microchip({ chipNumber: number }));
  assert.equal((await entryOf(again.entryId)).chipNumber, number);
  // The voided entry keeps its number on the record.
  assert.equal((await entryOf(entryId)).chipNumber, number);
  assert.deepEqual((await activityOf(mistypedOn)).at(-1), {
    activityType: AnimalActivityType.MEDICAL_ENTRY_VOIDED,
    changeSummary: `Microchip ${number} implanted on Oct 3, 2026 was voided. Reason: Number belongs to another animal.`,
  });
});

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

test("two animals recorded with one number at once: one lands, the other is refused by the index", async () => {
  const firstId = await makeAnimal("First at once");
  const secondId = await makeAnimal("Second at once");
  const number = chipNumber();
  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let recorded!: (pid: number) => void;
  const isRecorded = new Promise<number>((resolve) => (recorded = resolve));
  let holderEntryId = "";
  // The first has written its entry but not committed. The two animals'
  // locks don't overlap, so the second's own check can't see it: only the
  // unique index stops a second live entry with the number.
  const holder = prisma.$transaction(
    async (tx) => {
      ({ entryId: holderEntryId } = await recordMedicalEntry(
        tx,
        { ...microchip({ chipNumber: number }), animalId: firstId },
        staffId,
        TODAY,
      ));
      recorded(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isRecorded, holder as Promise<never>]);

  const second = prisma.$transaction(
    (tx) =>
      recordMedicalEntry(
        tx,
        { ...microchip({ chipNumber: number }), animalId: secondId },
        staffId,
        TODAY,
      ),
    { timeout },
  );
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

  const error = await second.then(
    () => assert.fail("The second record should have been refused."),
    (rejection: unknown) => rejection,
  );
  // Refused at the write, on the chip number field, by the index: the
  // second's own check ran before the first committed.
  assert.ok(error instanceof ChipNumberClash, String(error));
  assert.equal(error.field, "chipNumber");
  assert.equal(error.chipNumber, number);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: secondId } }), 0);

  // What the action shows: the service's own refusal, naming the holder.
  const named = await nameChipNumberHolder(prisma, error);
  assert.ok(named instanceof MedicalEntryRefusal, String(named));
  assert.equal(named.field, "chipNumber");
  assert.equal(
    named.message,
    `That chip number is already on First at once ${runId}'s record.`,
  );

  // If the holder lets the number go before the action reads it, the
  // refusal still stays on the chip number field.
  await voidEntry(holderEntryId, "Recorded on the wrong animal.");
  const unnamed = await nameChipNumberHolder(prisma, error);
  assert.equal(unnamed, error);
  assert.match((unnamed as ChipNumberClash).message, /Check the number and save again/);

  // Any other failure is passed on as it is.
  const other = new Error("boom");
  assert.equal(await nameChipNumberHolder(prisma, other), other);
});

test("a clash whose holder can't be looked up keeps its refusal on the chip number", async () => {
  const clash = new ChipNumberClash(chipNumber());
  const failingDb = {
    medicalEntry: {
      findFirst: () => Promise.reject(new Error("Connection lost.")),
    },
  } as unknown as Parameters<typeof nameChipNumberHolder>[0];
  const logged: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    assert.equal(await nameChipNumberHolder(failingDb, clash), clash);
  } finally {
    console.error = consoleError;
  }
  assert.equal(clash.field, "chipNumber");
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][1]), /Connection lost/);
});

test("a chip number can be corrected, under the same checks", async () => {
  const animalId = await makeAnimal("Corrected");
  const otherId = await makeAnimal("Corrected other");
  const taken = chipNumber();
  await record(otherId, microchip({ chipNumber: taken }));
  const wrong = chipNumber();
  const right = chipNumber();
  const { entryId } = await record(
    animalId,
    microchip({ chipNumber: wrong, brand: "Datamars" }),
  );

  await refusedOn(
    edit(entryId, microchip({ chipNumber: taken, brand: "Datamars" })),
    "chipNumber",
    /already on Corrected other/,
  );
  await refusedOn(
    edit(entryId, microchip({ chipNumber: "12" })),
    "chipNumber",
    /9 to 15/,
  );

  // Its own number, typed another way, is no change, and writes nothing.
  const written = async () => {
    const entry = await entryOf(entryId);
    return {
      updatedAt: entry.updatedAt.getTime(),
      detailsUpdatedAt: entry.microchip?.updatedAt.getTime(),
      events: await prisma.medicalEntryEvent.count({ where: { entryId } }),
      activity: (await activityOf(animalId)).length,
    };
  };
  const beforeNoOp = await written();
  const typedAnotherWay =
    `${wrong.slice(0, 4)} ${wrong.slice(4, 9)}-${wrong.slice(9)}`.toLowerCase();
  const unchanged = await edit(entryId, microchip({ chipNumber: typedAnotherWay }));
  assert.equal(unchanged.status, "unchanged");
  assert.deepEqual(await written(), beforeNoOp);

  // The brand is left out, so it is kept.
  const edited = await edit(entryId, microchip({ chipNumber: right }));
  assert.equal(edited.status, "edited");
  const entry = await entryOf(entryId);
  assert.equal(entry.chipNumber, right);
  assert.equal(entry.microchip?.brand, "Datamars");
  const events = await eventsOf(entryId);
  assert.equal(events.at(-1)?.action, MedicalEntryEventAction.EDITED);
  assert.deepEqual(events.at(-1)?.before, { chipNumber: wrong });
  assert.deepEqual(events.at(-1)?.after, { chipNumber: right });
  assert.equal(
    (await activityOf(animalId)).at(-1)?.changeSummary,
    `Microchip ${right} was corrected: the chip number changed from ${wrong} to ${right}.`,
  );
});

test("a chip is scheduled with no number, and needs one when it is recorded", async () => {
  const animalId = await makeAnimal("Scheduled");
  const { entryId } = await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.MICROCHIP, dueDate: day("2026-10-14") },
      staffId,
      TODAY,
    ),
  );
  const scheduled = await entryOf(entryId);
  assert.equal(scheduled.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(scheduled.chipNumber, null);
  assert.equal(scheduled.itemId, null);
  assert.equal(scheduled.microchip, null);
  assert.deepEqual((await eventsOf(entryId))[0].after, {
    kind: MedicalEntryKind.MICROCHIP,
    status: MedicalEntryStatus.SCHEDULED,
    dueDate: "2026-10-14",
    notes: null,
  });

  const recordScheduled = (input: RecordMedicalEntryInput) =>
    prisma.$transaction((tx) =>
      recordScheduledMedicalEntry(tx, entryId, input, editorId, TODAY),
    );
  await refusedOn(
    recordScheduled(microchip({ chipNumber: "" })),
    "chipNumber",
    /required/,
  );
  const number = chipNumber();
  await recordScheduled(microchip({ chipNumber: number, brand: "AVID", registrationStatus: "PENDING", registryName: "Scheduled Registry" }));

  const given = await entryOf(entryId);
  assert.equal(given.status, MedicalEntryStatus.COMPLETED);
  assert.equal(given.chipNumber, number);
  assert.equal(given.dueDate, "2026-10-14");
  assert.equal(given.microchip?.brand, "AVID");
  assert.equal(given.microchip?.registrationStatus, "PENDING");
  assert.equal(given.microchip?.registryName, "Scheduled Registry");
  assert.equal(((await eventsOf(entryId)).at(-1)!.after as Record<string, unknown>).registryName, "Scheduled Registry");
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      "Microchip scheduled for Oct 14, 2026.",
      `Microchip ${number} recorded: implanted in house, on Oct 3, 2026 (due Oct 14, 2026).`,
    ],
  );
});

test("a scheduled chip is refused a number another animal holds", async () => {
  const holderId = await makeAnimal("Scheduled holder");
  const animalId = await makeAnimal("Scheduled taken");
  const number = chipNumber();
  await record(holderId, microchip({ chipNumber: number }));
  const { entryId } = await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.MICROCHIP, dueDate: day("2026-10-14") },
      staffId,
      TODAY,
    ),
  );
  await refusedOn(
    prisma.$transaction((tx) =>
      recordScheduledMedicalEntry(
        tx,
        entryId,
        microchip({ chipNumber: number }),
        editorId,
        TODAY,
      ),
    ),
    "chipNumber",
    /already on Scheduled holder/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
});

test("a chip never schedules a next one", async () => {
  const animalId = await makeAnimal("No next");
  await refusedOn(
    record(animalId, {
      ...microchip(),
      scheduleNext: { dueDate: day("2026-11-03") },
    }),
    "scheduleNext",
    /Only a catalog item can repeat/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
});

test("global search finds an animal by a chip it carries, typed however it was read", async () => {
  const twoChips = await makeAnimal("Search two chips");
  const voidedOnly = await makeAnimal("Search voided chip");
  const scheduledOnly = await makeAnimal("Search scheduled chip");

  const first = chipNumber();
  const second = chipNumber();
  await record(twoChips, microchip({ chipNumber: first }));
  await record(
    twoChips,
    microchip({
      chipNumber: second,
      completedDate: null,
      source: MedicalEntrySource.BEFORE_INTAKE,
    }),
  );

  const voided = chipNumber();
  const { entryId: voidedId } = await record(voidedOnly, microchip({ chipNumber: voided }));
  await voidEntry(voidedId, "Mistyped.");

  // A scheduled chip has no number until it is given. Force one onto it, so
  // the search's own status filter is what leaves it out.
  const planned = chipNumber();
  const { entryId: scheduledId } = await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId: scheduledOnly, kind: MedicalEntryKind.MICROCHIP, dueDate: day("2026-10-20") },
      staffId,
      TODAY,
    ),
  );
  await prisma.medicalEntry.update({
    where: { id: scheduledId },
    data: { chipNumber: planned },
  });

  const found = async (query: string) =>
    (
      await prisma.animal.findMany({
        where: { AND: [animalSearchWhere(query), { speciesId }] },
        select: { id: true },
      })
    ).map((animal) => animal.id);

  assert.deepEqual(await found(first), [twoChips]);
  assert.deepEqual(await found(second), [twoChips]);
  // Lower case, with a space and a hyphen between groups.
  const typed = `${first.slice(0, 5)} ${first.slice(5, 10)}-${first.slice(10)}`.toLowerCase();
  assert.deepEqual(await found(typed), [twoChips]);
  assert.deepEqual(await found(voided), []);
  assert.deepEqual(await found(planned), []);
});

test("older microchip callers leave registration unknown", async () => {
  const animalId = await makeAnimal("Unknown registration");
  const { entryId } = await record(animalId, microchip());
  const chip = (await entryOf(entryId)).microchip!;
  assert.equal(chip.registrationStatus, "UNKNOWN");
  assert.equal(chip.registryName, null);
  assert.equal(chip.registrationDate, null);
  assert.equal(chip.registrationNotes, null);
});

test("ordinary chip corrections preserve registration and no-op audit", async () => {
  const animalId = await makeAnimal("Preserved registration");
  const input = microchip();
  const { entryId } = await record(animalId, input);
  const registration = {
    registrationStatus: "REGISTERED" as const,
    registryName: "Recorded registry",
    registrationDate: "2026-10-04",
    registrationNotes: "Staff registration note",
  };
  await prisma.microchipDetails.update({ where: { entryId }, data: registration });
  const before = await entryOf(entryId);
  const events = await eventsOf(entryId);
  const activity = await prisma.animalActivityLog.findMany({ where: { animalId } });
  assert.equal((await edit(entryId, input)).status, "unchanged");
  assert.deepEqual(await entryOf(entryId), before);
  assert.deepEqual(await eventsOf(entryId), events);
  assert.deepEqual(await prisma.animalActivityLog.findMany({ where: { animalId } }), activity);

  await edit(entryId, { ...input, brand: "Corrected brand" });
  const after = (await entryOf(entryId)).microchip!;
  for (const field of Object.keys(registration) as (keyof typeof registration)[]) {
    assert.equal(after[field], registration[field]);
  }
  const correction = (await eventsOf(entryId)).at(-1)!;
  assert.equal(correction.action, MedicalEntryEventAction.EDITED);
  assert.deepEqual(Object.keys(correction.before as object), ["brand"]);
  assert.deepEqual(Object.keys(correction.after as object), ["brand"]);
});

const registrationReset = { registrationStatus: "UNKNOWN" as const, registryName: null, registrationDate: null, registrationNotes: null };
const registered = { registrationStatus: "REGISTERED" as const, registryName: " Recorded Registry ", registrationDate: day("2026-10-04"), registrationNotes: " Staff-only note " };
const chipSnapshot = async (entryId: string, animalId: string) => ({ row: await entryOf(entryId), events: await eventsOf(entryId), activity: await activityOf(animalId) });

for (const state of ["UNKNOWN", "NOT_REGISTERED", "PENDING", "REGISTERED"] as const) test(`chip registration stores ${state} with truthful optional facts and snapshots`, async () => {
  const animalId = await makeAnimal(`Registration ${state}`);
  const input = microchip({ registrationStatus: state, registryName: state === "REGISTERED" || state === "PENDING" ? " Registry " : null, registrationNotes: " staff note " });
  const { entryId } = await record(animalId, input);
  const row = (await entryOf(entryId)).microchip!;
  assert.equal(row.registrationStatus, state); assert.equal(row.registryName, state === "REGISTERED" || state === "PENDING" ? "Registry" : null);
  assert.equal(row.registrationDate, null); assert.equal(row.registrationNotes, "staff note");
  assert.equal(((await eventsOf(entryId))[0].after as Record<string, unknown>).registrationStatus, state);
  const snapshot = await chipSnapshot(entryId, animalId);
  assert.equal((await edit(entryId, input)).status, "unchanged");
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

for (const [label, fields, field] of [
  ["missing registry", { registrationStatus: "REGISTERED" }, "registryName"],
  ["blank registry", { registrationStatus: "REGISTERED", registryName: " " }, "registryName"],
  ["pending completed day", { registrationStatus: "PENDING", registryName: "Registry", registrationDate: "2026-10-04" }, "registrationDate"],
  ["unknown registry", { registryName: "Registry" }, "registryName"],
  ["not registered day", { registrationStatus: "NOT_REGISTERED", registrationDate: "2026-10-04" }, "registrationDate"],
  ["forged state", { registrationStatus: "TRANSFERRED" }, "registrationStatus"],
  ["null state", { registrationStatus: null }, "registrationStatus"],
  ["forged text", { registrationNotes: 123 }, "registrationNotes"],
  ["long registry", { registrationStatus: "REGISTERED", registryName: "x".repeat(101) }, "registryName"],
  ["long note", { registrationNotes: "x".repeat(2001) }, "registrationNotes"],
  ["invalid day", { registrationStatus: "REGISTERED", registryName: "Registry", registrationDate: "2026-02-29" }, "registrationDate"],
] as const) test(`direct registration writer refuses ${label} without writing`, async () => {
  const animalId = await makeAnimal(`Invalid registration ${label}`);
  await refusedOn(record(animalId, microchip(fields as Partial<MicrochipEntryInput>)), field, /./);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
  assert.deepEqual(await activityOf(animalId), []);
  const input = microchip(), { entryId } = await record(animalId, input);
  const snapshot = await chipSnapshot(entryId, animalId);
  await refusedOn(edit(entryId, { ...input, ...fields } as MicrochipEntryInput), field, /./);
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

for (const [label, registrationDate, extra] of [
  ["future", "2026-10-11", {}],
  ["before birth", "2023-12-31", { source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null }],
  ["before implantation", "2026-10-02", {}],
] as const) test(`registration refuses a day ${label} on create and correction`, async () => {
  const animalId = await makeAnimal(`Registration day ${label}`);
  const values = microchip({ ...registered, registrationDate: day(registrationDate), ...extra });
  await refusedOn(record(animalId, values), "registrationDate", /can't be/);
  const input = microchip(extra), { entryId } = await record(animalId, input);
  const snapshot = await chipSnapshot(entryId, animalId);
  await refusedOn(edit(entryId, { ...values, chipNumber: input.chipNumber }), "registrationDate", /can't be/);
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

test("registration accepts the implantation day, before-intake days and a day preceding a known scan", async () => {
  const animalId = await makeAnimal("Registration day boundaries");
  for (const extra of [
    { registrationDate: day("2026-10-03") },
    { source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null, registrationDate: day("2026-06-01") },
    { source: MedicalEntrySource.BEFORE_INTAKE, completedDate: day("2026-07-01"), registrationDate: day("2026-06-01") },
  ]) {
    const { entryId } = await record(animalId, microchip({ ...registered, ...extra }));
    assert.equal((await entryOf(entryId)).microchip!.registrationDate, extra.registrationDate);
  }
});

test("a corrected implantation day rechecks the retained registration day", async () => {
  const animalId = await makeAnimal("Later implantation");
  const input = microchip({ ...registered }), { entryId } = await record(animalId, input);
  const snapshot = await chipSnapshot(entryId, animalId);
  await refusedOn(edit(entryId, { ...microchip({ chipNumber: input.chipNumber }), completedDate: day("2026-10-05") }), "registrationDate", /implantation/);
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

test("two chips keep independent registration, explicit clearing is audited, and re-recording never copies it", async () => {
  const animalId = await makeAnimal("Independent registrations");
  const input = microchip({ ...registered }), first = await record(animalId, input);
  const secondInput = microchip({ registrationStatus: "PENDING", registryName: "Other Registry" }), second = await record(animalId, secondInput);
  const current = (await findCurrentChips(prisma, [animalId])).get(animalId)!;
  assert.equal(current.length, 2);
  assert.equal(current.find((row) => row.entryId === first.entryId)!.registrationStatus, "REGISTERED");
  assert.equal(current.find((row) => row.entryId === second.entryId)!.registryName, "Other Registry");
  assert.equal(JSON.stringify(current).includes("Staff-only"), false);
  await edit(first.entryId, { ...input, ...registrationReset });
  const event = (await eventsOf(first.entryId)).at(-1)!;
  assert.equal((event.before as Record<string, unknown>).registrationStatus, "REGISTERED");
  assert.deepEqual(event.after, registrationReset);
  assert.match((await activityOf(animalId)).at(-1)!.changeSummary!, /registration status changed from registered to unknown/);
  assert.match((await activityOf(animalId)).at(-1)!.changeSummary!, /registration notes were removed/);
  assert.equal((await entryOf(second.entryId)).microchip!.registrationStatus, "PENDING");
  await voidEntry(second.entryId, "Wrong chip record");
  const again = await record(animalId, microchip({ chipNumber: secondInput.chipNumber }));
  assert.equal((await entryOf(again.entryId)).microchip!.registrationStatus, "UNKNOWN");
});

for (const notesOnly of [false, true]) test(`number replacement requires every explicit registration key (${notesOnly ? "notes only" : "registered"})`, async () => {
  const animalId = await makeAnimal("Replacement registration");
  const input = microchip(notesOnly ? { registrationNotes: "Unknown registry note" } : registered), { entryId } = await record(animalId, input);
  const changed = microchip();
  const snapshot = await chipSnapshot(entryId, animalId);
  await refusedOn(edit(entryId, changed), "registrationStatus", /this chip number/);
  for (const key of Object.keys(registrationReset)) {
    const group: Record<string, unknown> = { ...registrationReset }; delete group[key];
    await refusedOn(edit(entryId, { ...changed, ...group }), "registrationStatus", /this chip number/);
  }
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
  const formatting = input.chipNumber.toLowerCase().split("").join("-");
  assert.equal((await edit(entryId, microchip({ chipNumber: formatting }))).status, "unchanged");
  await edit(entryId, { ...changed, ...registrationReset });
  const event = (await eventsOf(entryId)).at(-1)!;
  assert.equal((event.before as Record<string, unknown>).chipNumber, input.chipNumber);
  assert.equal((event.after as Record<string, unknown>).chipNumber, changed.chipNumber);
  assert.equal((event.after as Record<string, unknown>).registrationNotes, null);
});

test("archived chips can be corrected, voided chips cannot, and registration does not bypass uniqueness", async () => {
  const animalId = await makeAnimal("Archived registration"), otherId = await makeAnimal("Chip holder registration");
  const input = microchip(), { entryId } = await record(animalId, input);
  const held = microchip({ ...registered }); await record(otherId, held);
  await refusedOn(edit(entryId, { ...input, ...registered, chipNumber: held.chipNumber }), "chipNumber", /already on/);
  await prisma.animal.update({ where: { id: animalId }, data: { listingStatus: "ARCHIVED" } });
  await edit(entryId, { ...input, ...registered });
  assert.equal((await entryOf(entryId)).microchip!.registrationStatus, "REGISTERED");
  await voidEntry(entryId, "Incorrect chip");
  const snapshot = await chipSnapshot(entryId, animalId);
  await assert.rejects(edit(entryId, { ...input, ...registrationReset }), /voided/);
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

test("failure writing registration audit rolls back changed chip and details", async () => {
  const animalId = await makeAnimal("Registration audit rollback");
  const input = microchip(), { entryId } = await record(animalId, input);
  const snapshot = await chipSnapshot(entryId, animalId);
  await assert.rejects(prisma.$transaction((tx) => editMedicalEntry(tx, entryId, { ...input, ...registered, chipNumber: chipNumber() }, "missing-registration-actor", TODAY)));
  assert.deepEqual(await chipSnapshot(entryId, animalId), snapshot);
});

for (const operation of ["correct", "void", "replace"] as const) test(`a registration correction waits behind ${operation} and reads the latest locked values`, async () => {
  const animalId = await makeAnimal(`Serialized registration ${operation}`);
  const input = microchip(), { entryId } = await record(animalId, input);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let ready!: (pid: number) => void; const started = new Promise<number>((resolve) => { ready = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    if (operation === "void") await voidMedicalEntry(tx, entryId, "Voided while correcting", editorId);
    else await editMedicalEntry(tx, entryId, { ...input, ...registered }, editorId, TODAY);
    ready(await backendPid(tx)); await gate;
  }, { timeout: 20_000 });
  const pid = await Promise.race([started, holder as Promise<never>]);
  const second = prisma.$transaction((tx) => editMedicalEntry(tx, entryId,
    operation === "replace" ? microchip() : { ...input, registrationNotes: "Later correction" }, staffId, TODAY), { timeout: 20_000 });
  void second.catch(() => {});
  try { await waitForSessionBlockedBy(pid); } finally { release(); await Promise.allSettled([holder, second]); }
  await holder;
  if (operation === "correct") {
    assert.equal((await second).status, "edited");
    const row = (await entryOf(entryId)).microchip!;
    assert.equal(row.registryName, "Recorded Registry"); assert.equal(row.registrationNotes, "Later correction");
    assert.deepEqual((await eventsOf(entryId)).at(-1)!.before, { registrationNotes: "Staff-only note" });
  } else {
    await assert.rejects(second, operation === "void" ? /voided/ : /this chip number/);
    assert.equal((await eventsOf(entryId)).length, 2);
    assert.equal((await entryOf(entryId)).chipNumber, input.chipNumber);
  }
});
