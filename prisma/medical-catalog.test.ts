// The medical catalog's rules, against a real Postgres: the unique index on
// (kind, name), the species many-to-many and the Restrict from entries to
// items only exist there. `medical-catalog.ts` is the whole of each catalog
// action bar the session check and the cache invalidation.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  DoseSlot,
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalItemKind,
  MedicalRoute,
  MedicationFrequency,
  Sex,
} from "@/prisma/generated/enums";
import {
  createMedicalItem,
  retireMedicalItem,
  unretireMedicalItem,
  updateMedicalItem,
  type MedicalItemInput,
} from "@/app/lib/services/medical-catalog";
import { recordMedicalEntry } from "@/app/lib/services/medical-entry";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import {
  findMedicalBatchItems,
  findMedicalCatalog,
  findMedicalEntryFormItems,
  findPickableMedicalItems,
} from "@/app/lib/data/medical-catalog";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.
const runId = randomUUID().slice(0, 8);

let dogId: string;
let catId: string;
let colorId: string;
let staffId: string;

before(async () => {
  dogId = (
    await prisma.species.create({
      data: { name: `Catalog dog ${runId}` },
      select: { id: true },
    })
  ).id;
  catId = (
    await prisma.species.create({
      data: { name: `Catalog cat ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Catalog color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Catalog staff ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  // Takes the entries with it.
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

let counter = 0;
const uniqueName = (label: string) => `${label} ${++counter} ${runId}`;

const medication = (overrides: Partial<MedicalItemInput> = {}): MedicalItemInput => ({
  kind: MedicalItemKind.MEDICATION,
  name: uniqueName("Medication"),
  speciesIds: [],
  analytes: [],
  ...overrides,
});

const vaccine = (overrides: Partial<MedicalItemInput> = {}): MedicalItemInput => ({
  kind: MedicalItemKind.VACCINE,
  name: uniqueName("Vaccine"),
  speciesIds: [],
  analytes: [],
  ...overrides,
});

const testItem = (
  analyteNames: string[],
  overrides: Partial<MedicalItemInput> = {},
): MedicalItemInput => ({
  kind: MedicalItemKind.TEST,
  name: uniqueName("Test"),
  speciesIds: [],
  analytes: analyteNames.map((name) => ({ name })),
  ...overrides,
});

const create = (input: MedicalItemInput) =>
  prisma.$transaction((tx) => createMedicalItem(tx, input));
const update = (itemId: string, input: MedicalItemInput) =>
  prisma.$transaction((tx) => updateMedicalItem(tx, itemId, input));
const retire = (itemId: string) =>
  prisma.$transaction((tx) => retireMedicalItem(tx, itemId));
const unretire = (itemId: string) =>
  prisma.$transaction((tx) => unretireMedicalItem(tx, itemId));

const analytesOf = (itemId: string) =>
  prisma.medicalItemAnalyte.findMany({
    where: { itemId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true, retiredAt: true },
  });

const newAnimal = () =>
  prisma.animal.create({
    data: {
      name: `Catalog animal ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId: dogId,
      primaryColorId: colorId,
    },
    select: { id: true },
  });

/** An animal with one vaccine entry on `itemId`, recorded the way staff
 * record one. The catalog only cares that the item is in use. */
const useItem = async (itemId: string) => {
  const animal = await newAnimal();
  const { entryId } = await prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId: animal.id,
        kind: MedicalEntryKind.VACCINE,
        itemId,
        completedDate: calendarDay("2026-09-01"),
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      calendarDay("2026-10-10"),
    ),
  );
  return prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { id: true, updatedAt: true },
  });
};

test("an item is created with its species, defaults and analytes in order", async () => {
  const { id } = await create({
    kind: MedicalItemKind.TREATMENT,
    name: `  Pyrantel   ${runId} `,
    manufacturer: " ",
    speciesIds: [dogId],
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseAmount: 2.5,
    defaultDoseUnit: DoseUnit.ML,
    repeatIntervalDays: 14,
    analytes: [],
  });
  const item = await prisma.medicalItem.findUniqueOrThrow({
    where: { id },
    include: { species: { select: { id: true } } },
  });
  assert.equal(item.name, `Pyrantel ${runId}`);
  assert.equal(item.manufacturer, null);
  assert.deepEqual(item.species, [{ id: dogId }]);
  assert.equal(item.defaultDoseAmount, 2.5);
  assert.equal(item.defaultDoseUnit, DoseUnit.ML);
  assert.equal(item.repeatIntervalDays, 14);
  assert.equal(item.isRabies, false);

  const combo = await create(testItem(["FeLV antigen", "FIV antibody"]));
  assert.deepEqual(
    (await analytesOf(combo.id)).map(({ name, sortOrder }) => [name, sortOrder]),
    [
      ["FeLV antigen", 0],
      ["FIV antibody", 1],
    ],
  );
});

test("a name is unique within its kind, ignoring case, and free in another kind", async () => {
  const name = uniqueName("Bordetella");
  await create(vaccine({ name }));

  await assert.rejects(
    create(vaccine({ name: name.toUpperCase() })),
    (error: Error) =>
      error instanceof ConflictError &&
      error.message === `A vaccine named "${name}" already exists.`,
  );
  // A rename onto another item's name is refused the same way.
  const other = await create(vaccine());
  await assert.rejects(
    update(other.id, vaccine({ name })),
    ConflictError,
  );

  await create({
    kind: MedicalItemKind.TREATMENT,
    name,
    speciesIds: [],
    analytes: [],
  });
});

test("a name holding _, % or a backslash matches only itself", async () => {
  const named = (label: string) => `${label} ${runId}`;
  await create(vaccine({ name: named("T4 low") }));
  await create(vaccine({ name: named("100 blind") }));
  await create(vaccine({ name: named("Ab") }));

  // Each would match an existing name if read as a pattern.
  await create(vaccine({ name: named("T4_low") }));
  await create(vaccine({ name: named("100% blind") }));
  await create(vaccine({ name: named("A\\b") }));

  // Each is still refused against itself, in another case, and adds nothing.
  const itemsOfThisRun = () =>
    prisma.medicalItem.count({ where: { name: { endsWith: runId } } });
  const countBefore = await itemsOfThisRun();
  for (const label of ["t4_LOW", "100% BLIND", "a\\B"]) {
    await assert.rejects(create(vaccine({ name: named(label) })), ConflictError);
  }
  assert.equal(await itemsOfThisRun(), countBefore);

  // The same holds for a rename, which leaves the item as it was.
  const other = await create(vaccine());
  await update(other.id, vaccine({ name: named("T_ low") }));
  const readOther = () =>
    prisma.medicalItem.findUniqueOrThrow({
      where: { id: other.id },
      include: { species: { select: { id: true } }, analytes: true },
    });
  const otherBefore = await readOther();
  await assert.rejects(
    update(other.id, vaccine({ name: named("T4_LOW"), manufacturer: "Changed" })),
    (error: Error) =>
      error instanceof ConflictError &&
      error.message === `A vaccine named "${named("T4_low")}" already exists.`,
  );
  assert.deepEqual(await readOther(), otherBefore);
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

/**
 * Creates `first` and holds its transaction open, uncommitted, so the second
 * can't see its row: only the name lock stops a second row. Then creates
 * `second`, which must be seen waiting on that lock. Returns the second's
 * outcome once both have finished.
 */
const createTwoAtOnce = async (first: string, second: string) => {
  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let created!: (pid: number) => void;
  const isCreated = new Promise<number>((resolve) => (created = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await createMedicalItem(tx, vaccine({ name: first }));
      created(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isCreated, holder as Promise<never>]);

  const later = prisma.$transaction(
    (tx) => createMedicalItem(tx, vaccine({ name: second })),
    { timeout },
  );
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void later.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    // Released even when the wait fails, and both seen to their end, so
    // neither transaction outlives the test.
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  return later;
};

test("two creates of one name in different case at once: the second waits, then is refused", async () => {
  const name = uniqueName("Raced");
  await assert.rejects(createTwoAtOnce(name, name.toLowerCase()), ConflictError);
  assert.equal(
    await prisma.medicalItem.count({
      where: { name: { in: [name, name.toLowerCase()] } },
    }),
    1,
  );
});

// JavaScript lowercases a dotted capital I to "i" and a combining dot, but
// Postgres to a plain "i", so the database counts these two as one name. The
// name lock has to agree with it.
test("two creates of names only the database counts as one: the second waits, then is refused", async () => {
  const first = `İvermektin ${runId}`;
  const second = `ivermektin ${runId}`;
  await assert.rejects(createTwoAtOnce(first, second), ConflictError);
  assert.equal(
    await prisma.medicalItem.count({ where: { name: { in: [first, second] } } }),
    1,
  );
});

test("a retired item still holds its name, and the refusal says to unretire it", async () => {
  const name = uniqueName("Old stock");
  const { id } = await create(vaccine({ name }));
  await retire(id);

  await assert.rejects(
    create(vaccine({ name })),
    (error: Error) =>
      error instanceof ConflictError && /Unretire it instead/.test(error.message),
  );
});

test("only a vaccine can be a rabies vaccine", async () => {
  await assert.rejects(
    create(testItem(["Antigen"], { isRabies: true })),
    (error: Error) =>
      error instanceof PreconditionFailedError &&
      error.message === "Only a vaccine can be a rabies vaccine.",
  );
  await assert.rejects(
    create({
      kind: MedicalItemKind.TREATMENT,
      name: uniqueName("Treatment"),
      speciesIds: [],
      analytes: [],
      isRabies: true,
    }),
    PreconditionFailedError,
  );
  const { id } = await create(vaccine({ isRabies: true }));
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } })).isRabies,
    true,
  );
});

test("a test needs a live analyte, and only a test has analytes", async () => {
  await assert.rejects(create(testItem([])), PreconditionFailedError);
  await assert.rejects(
    create(testItem(["Antigen", " antigen "])),
    (error: Error) =>
      error instanceof PreconditionFailedError && /listed twice/.test(error.message),
  );
  await assert.rejects(
    create(vaccine({ analytes: [{ name: "Antigen" }] })),
    (error: Error) =>
      error instanceof PreconditionFailedError &&
      error.message === "Only a test has analytes.",
  );

  // Leaving every analyte out of an update would retire them all.
  const { id } = await create(testItem(["Antigen"]));
  await assert.rejects(
    update(id, testItem([], { name: uniqueName("Test") })),
    PreconditionFailedError,
  );
  assert.equal((await analytesOf(id))[0].retiredAt, null);
});

test("dose defaults are for treatments; a vaccine has a route only, a test neither", async () => {
  await assert.rejects(
    create(vaccine({ defaultDoseAmount: 1, defaultDoseUnit: DoseUnit.ML })),
    PreconditionFailedError,
  );
  await assert.rejects(
    create(testItem(["Antigen"], { defaultRoute: MedicalRoute.ORAL })),
    PreconditionFailedError,
  );
  await assert.rejects(
    create({
      kind: MedicalItemKind.TREATMENT,
      name: uniqueName("Treatment"),
      speciesIds: [],
      analytes: [],
      defaultDoseAmount: 1,
    }),
    (error: Error) =>
      error instanceof PreconditionFailedError &&
      error.message === "A default dose needs a unit.",
  );
  await assert.rejects(
    create({
      kind: MedicalItemKind.TREATMENT,
      name: uniqueName("Treatment"),
      speciesIds: [],
      analytes: [],
      defaultDoseAmount: 0,
      defaultDoseUnit: DoseUnit.MG,
    }),
    PreconditionFailedError,
  );

  await create(vaccine({ defaultRoute: MedicalRoute.SUBCUTANEOUS }));
});

test("a repeat interval is at most five years of days, so its next dose can be scheduled", async () => {
  const { id } = await create(vaccine({ repeatIntervalDays: 1825 }));
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } }))
      .repeatIntervalDays,
    1825,
  );
  await assert.rejects(
    create(vaccine({ repeatIntervalDays: 1826 })),
    (error: Error) =>
      error instanceof PreconditionFailedError &&
      /at most 1825 days/.test(error.message),
  );
});

test("an unused item can change kind; one in use can't", async () => {
  // Unused: a test becomes a vaccine, and its analytes go with the change.
  const unused = await create(testItem(["Antigen"]));
  await update(unused.id, vaccine({ name: uniqueName("Was a test") }));
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id: unused.id } }))
      .kind,
    MedicalItemKind.VACCINE,
  );
  assert.deepEqual(await analytesOf(unused.id), []);

  const name = uniqueName("In use");
  const used = await create(vaccine({ name }));
  await useItem(used.id);
  await assert.rejects(
    update(used.id, {
      kind: MedicalItemKind.TREATMENT,
      name,
      speciesIds: [],
      analytes: [],
    }),
    (error: Error) =>
      error instanceof ConflictError && /used on animals/.test(error.message),
  );
  // ...while the rest of it can still be corrected.
  await update(used.id, vaccine({ name: uniqueName("In use, renamed") }));
});

test("retiring and unretiring round trip, and leave entries alone", async () => {
  const { id } = await create(vaccine());
  const entry = await useItem(id);

  await retire(id);
  assert.notEqual(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } })).retiredAt,
    null,
  );
  await assert.rejects(retire(id), ConflictError);

  await unretire(id);
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } })).retiredAt,
    null,
  );
  await assert.rejects(unretire(id), ConflictError);

  const after = await prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entry.id },
    select: { itemId: true, updatedAt: true },
  });
  assert.equal(after.itemId, id);
  assert.deepEqual(after.updatedAt, entry.updatedAt);

  await assert.rejects(retire("missing-item"), NotFoundError);
});

test("an update renames, reorders, retires and adds analytes", async () => {
  const input = testItem(["Alpha", "Beta", "Gamma"]);
  const { id } = await create(input);
  const [alpha, beta, gamma] = await analytesOf(id);

  await update(id, {
    ...input,
    analytes: [
      { id: gamma.id, name: "Gamma" },
      { id: alpha.id, name: "Alpha prime" },
      { name: "Delta" },
    ],
  });

  const rows = await analytesOf(id);
  const live = rows.filter((row) => !row.retiredAt);
  assert.deepEqual(
    live.map(({ id: rowId, name, sortOrder }) => [rowId, name, sortOrder]),
    [
      [gamma.id, "Gamma", 0],
      [alpha.id, "Alpha prime", 1],
      [live[2].id, "Delta", 2],
    ],
  );
  const retired = rows.filter((row) => row.retiredAt);
  assert.deepEqual(
    retired.map((row) => row.id),
    [beta.id],
  );
});

test("adding back a retired analyte's name restores that analyte", async () => {
  const input = testItem(["Antigen", "Antibody"]);
  const { id } = await create(input);
  const [antigen, antibody] = await analytesOf(id);

  await update(id, { ...input, analytes: [{ id: antigen.id, name: "Antigen" }] });
  await update(id, {
    ...input,
    analytes: [{ id: antigen.id, name: "Antigen" }, { name: "ANTIBODY" }],
  });

  const rows = await analytesOf(id);
  assert.equal(rows.length, 2);
  const restored = rows.find((row) => row.id === antibody.id)!;
  assert.equal(restored.retiredAt, null);
  assert.equal(restored.name, "ANTIBODY");
});

test("removing an analyte and adding its name back in one edit keeps that analyte", async () => {
  const input = testItem(["Antigen", "Antibody"]);
  const { id } = await create(input);
  const [antigen, antibody] = await analytesOf(id);

  await update(id, {
    ...input,
    analytes: [{ name: "antibody" }, { id: antigen.id, name: "Antigen" }],
  });

  const rows = await analytesOf(id);
  assert.deepEqual(
    rows.map((row) => [row.id, row.name, row.retiredAt]),
    [
      [antibody.id, "antibody", null],
      [antigen.id, "Antigen", null],
    ],
  );

  // Giving the name to the other analyte instead is still refused.
  await assert.rejects(
    update(id, { ...input, analytes: [{ id: antigen.id, name: "Antibody" }] }),
    ConflictError,
  );
});

test("a retired analyte's name can't be given to another analyte", async () => {
  const input = testItem(["Antigen", "Antibody"]);
  const { id } = await create(input);
  const [antigen] = await analytesOf(id);

  await update(id, { ...input, analytes: [{ id: antigen.id, name: "Antigen" }] });
  await assert.rejects(
    update(id, { ...input, analytes: [{ id: antigen.id, name: "Antibody" }] }),
    ConflictError,
  );
});

test("two analytes can swap names", async () => {
  const input = testItem(["Left", "Right"]);
  const { id } = await create(input);
  const [left, right] = await analytesOf(id);

  await update(id, {
    ...input,
    analytes: [
      { id: left.id, name: "Right" },
      { id: right.id, name: "Left" },
    ],
  });
  assert.deepEqual(
    (await analytesOf(id)).map(({ id: rowId, name }) => [rowId, name]),
    [
      [left.id, "Right"],
      [right.id, "Left"],
    ],
  );
});

test("an analyte from another test is refused", async () => {
  const one = await create(testItem(["Antigen"]));
  const otherInput = testItem(["Antibody"]);
  const other = await create(otherInput);
  const [foreign] = await analytesOf(one.id);

  await assert.rejects(
    update(other.id, { ...otherInput, analytes: [{ id: foreign.id, name: "X" }] }),
    PreconditionFailedError,
  );
});

test("the pickable items are live, of the kind, and for the animal's species", async () => {
  const forAll = await create(vaccine());
  const forDogs = await create(vaccine({ speciesIds: [dogId] }));
  const forCats = await create(vaccine({ speciesIds: [catId] }));
  const forBoth = await create(vaccine({ speciesIds: [dogId, catId] }));
  const retired = await create(vaccine({ speciesIds: [dogId] }));
  await retire(retired.id);
  const aTest = await create(testItem(["Antigen", "Retired analyte"]));
  const treatmentForAll = await create({
    kind: MedicalItemKind.TREATMENT,
    name: uniqueName("Treatment"),
    speciesIds: [],
    analytes: [],
  });

  const ours = (ids: string[]) =>
    ids.filter((id) =>
      [
        forAll.id,
        forDogs.id,
        forCats.id,
        forBoth.id,
        retired.id,
        aTest.id,
        treatmentForAll.id,
      ].includes(id),
    );

  const dogVaccines = await findPickableMedicalItems(
    prisma,
    dogId,
    MedicalItemKind.VACCINE,
  );
  assert.deepEqual(
    new Set(ours(dogVaccines.map((item) => item.id))),
    new Set([forAll.id, forDogs.id, forBoth.id]),
  );

  const catVaccines = await findPickableMedicalItems(
    prisma,
    catId,
    MedicalItemKind.VACCINE,
  );
  assert.deepEqual(
    new Set(ours(catVaccines.map((item) => item.id))),
    new Set([forAll.id, forCats.id, forBoth.id]),
  );

  // A retired analyte isn't asked for.
  const [antigen] = await analytesOf(aTest.id);
  await update(aTest.id, {
    ...testItem([]),
    name: (await prisma.medicalItem.findUniqueOrThrow({ where: { id: aTest.id } }))
      .name,
    analytes: [{ id: antigen.id, name: "Antigen" }],
  });
  const tests = await findPickableMedicalItems(prisma, dogId, MedicalItemKind.TEST);
  const picked = tests.find((item) => item.id === aTest.id);
  assert.deepEqual(picked?.analytes, [{ id: antigen.id, name: "Antigen" }]);
});

test("a medication carries a default route, dose and unit, and nothing its order decides", async () => {
  const name = uniqueName("Doxycycline");
  const { id } = await create(
    medication({
      name,
      manufacturer: "Zoetis",
      defaultRoute: MedicalRoute.ORAL,
      defaultDoseAmount: 100,
      defaultDoseUnit: DoseUnit.MG,
    }),
  );
  const stored = await prisma.medicalItem.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.kind, MedicalItemKind.MEDICATION);
  assert.equal(stored.defaultRoute, MedicalRoute.ORAL);
  assert.equal(stored.defaultDoseAmount, 100);
  assert.equal(stored.defaultDoseUnit, DoseUnit.MG);
  assert.equal(stored.repeatIntervalDays, null);

  const refused = (message: string) => (error: Error) =>
    error instanceof PreconditionFailedError && error.message === message;
  await assert.rejects(
    create(medication({ repeatIntervalDays: 14 })),
    refused("A medication has no repeat interval: an order says how often."),
  );
  await assert.rejects(
    update(id, medication({ name, repeatIntervalDays: 14 })),
    refused("A medication has no repeat interval: an order says how often."),
  );
  await assert.rejects(
    create(medication({ isRabies: true })),
    refused("Only a vaccine can be a rabies vaccine."),
  );
  await assert.rejects(
    create(medication({ analytes: [{ name: "Antigen" }] })),
    refused("Only a test has analytes."),
  );
  await assert.rejects(
    create(medication({ defaultDoseAmount: 1 })),
    refused("A default dose needs a unit."),
  );
  await assert.rejects(
    create(medication({ defaultDoseAmount: 0, defaultDoseUnit: DoseUnit.MG })),
    PreconditionFailedError,
  );
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } })).repeatIntervalDays,
    null,
  );
});

test("a medication is ordered, never entered: the entry and batch pickers leave it out, and an entry naming it is refused", async () => {
  const animal = await newAnimal();
  const ordered = await create(medication());
  const given = await create(vaccine());

  const { items } = await findMedicalEntryFormItems(prisma, {
    id: animal.id,
    speciesId: dogId,
  });
  const offered = new Set(items.map((item) => item.id));
  assert.ok(offered.has(given.id));
  assert.ok(!offered.has(ordered.id));
  assert.ok(!items.some((item) => item.kind === MedicalItemKind.MEDICATION));

  const batch = new Set((await findMedicalBatchItems(prisma)).map((item) => item.id));
  assert.ok(batch.has(given.id));
  assert.ok(!batch.has(ordered.id));

  // What the order form reads.
  const orderable = await findPickableMedicalItems(
    prisma,
    dogId,
    MedicalItemKind.MEDICATION,
  );
  assert.ok(orderable.some((item) => item.id === ordered.id));
  assert.ok(!orderable.some((item) => item.id === given.id));

  for (const kind of [MedicalEntryKind.VACCINE, MedicalEntryKind.TREATMENT]) {
    await assert.rejects(
      prisma.$transaction((tx) =>
        recordMedicalEntry(
          tx,
          {
            animalId: animal.id,
            kind,
            itemId: ordered.id,
            completedDate: calendarDay("2026-09-01"),
            source: MedicalEntrySource.IN_HOUSE,
          },
          staffId,
          calendarDay("2026-10-10"),
        ),
      ),
      (error: Error) =>
        error instanceof MedicalEntryRefusal &&
        error.field === "itemId" &&
        / is a medication, not a (vaccine|treatment)\.$/.test(error.message),
    );
  }
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: animal.id } }), 0);
});

test("a medication once ordered keeps its kind, and the catalog counts its orders", async () => {
  // Unused, it can change kind and back.
  const unused = await create(medication());
  const unusedName = (await prisma.medicalItem.findUniqueOrThrow({ where: { id: unused.id } })).name;
  await update(unused.id, { ...medication(), kind: MedicalItemKind.TREATMENT, name: unusedName });
  await update(unused.id, medication({ name: unusedName }));

  const name = uniqueName("Ordered");
  const { id } = await create(medication({ name }));
  const animal = await newAnimal();
  await prisma.medicationOrder.create({
    data: {
      animalId: animal.id,
      itemId: id,
      doseAmount: 100,
      doseUnit: DoseUnit.MG,
      route: MedicalRoute.ORAL,
      frequency: MedicationFrequency.BID,
      startDate: "2026-09-01",
      firstSlot: DoseSlot.AM,
      createdById: staffId,
    },
  });

  await assert.rejects(
    update(id, { ...medication(), kind: MedicalItemKind.TREATMENT, name }),
    (error: Error) =>
      error instanceof ConflictError &&
      error.message ===
        "This medication has been ordered for animals, so it can't become a treatment. Retire it and add a new item instead.",
  );
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id } })).kind,
    MedicalItemKind.MEDICATION,
  );
  // ...while the rest of it can still be corrected.
  await update(id, medication({ name, defaultRoute: MedicalRoute.ORAL }));

  const catalog = new Map((await findMedicalCatalog(prisma)).map((item) => [item.id, item]));
  assert.equal(catalog.get(id)?._count.medicationOrders, 1);
  assert.equal(catalog.get(id)?._count.entries, 0);
  assert.equal(catalog.get(unused.id)?._count.medicationOrders, 0);
});
