// The medical catalog's rules, against a real Postgres: the unique index on
// (kind, name), the species many-to-many and the Restrict from entries to
// items only exist there. `medical-catalog.ts` is the whole of each catalog
// action bar the session check and the cache invalidation.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalItemKind,
  MedicalRoute,
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
import { findPickableMedicalItems } from "@/app/lib/data/medical-catalog";
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

/** An animal with one vaccine entry on `itemId`, recorded the way staff
 * record one. The catalog only cares that the item is in use. */
const useItem = async (itemId: string) => {
  const animal = await prisma.animal.create({
    data: {
      name: `Catalog animal ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId: dogId,
      primaryColorId: colorId,
    },
    select: { id: true },
  });
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

test("two creates of one name in different case at once: the second waits, then is refused", async () => {
  const name = uniqueName("Raced");
  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let created!: (pid: number) => void;
  const isCreated = new Promise<number>((resolve) => (created = resolve));
  // The first create has written its row but not committed, so the second
  // can't see it: only the name lock stops a second row.
  const holder = prisma.$transaction(
    async (tx) => {
      await createMedicalItem(tx, vaccine({ name }));
      created(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isCreated, holder as Promise<never>]);

  const second = prisma.$transaction(
    (tx) => createMedicalItem(tx, vaccine({ name: name.toLowerCase() })),
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
  await assert.rejects(second, ConflictError);
  assert.equal(
    await prisma.medicalItem.count({
      where: { name: { equals: name, mode: "insensitive" } },
    }),
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
