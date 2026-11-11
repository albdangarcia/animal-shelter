// What the Settings catalogs refuse: a name a live row already has in other
// capitals (when adding, renaming or restoring; `_`, `%` and `\` in a name are
// plain characters), and a breed added, moved or restored under a deleted
// species (as a unit in a deleted location is refused, which
// unit-housing.test.ts covers with its lock). The species and breed lock is
// driven here: a species delete and a breed add, move or restore at the same
// moment end with no live breed under a deleted species.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  CharacteristicCategory,
  LocationType,
  Sex,
  AnimalListingStatus,
} from "@/prisma/generated/enums";
import {
  addBreed,
  BREED_NAME_TAKEN,
  BREED_SPECIES_DELETED,
  BREED_SPECIES_GONE,
  deleteSpeciesIfUnused,
  editBreed,
  findLiveBreedNamed,
  findLiveCharacteristicNamed,
  findLiveColorNamed,
  findLiveLocationNamed,
  findLiveSpeciesNamed,
  findLiveUnitNamed,
  restoreBreed,
  restoreCharacteristic,
  restoreColor,
  restoreLocation,
  restoreSpecies,
  restoreUnit,
  SPECIES_IN_USE,
} from "@/app/lib/services/settings-catalog";

const runId = Date.now().toString(36);
const deletedAt = new Date();

const characteristicIds: string[] = [];
const colorIds: string[] = [];
const speciesIds: string[] = [];
const locationIds: string[] = [];

const id = (row: { id: string }) => row.id;

let animalColorId: string;

before(async () => {
  animalColorId = id(
    await prisma.color.create({ data: { name: `Catalog animal color ${runId}` } }),
  );
  colorIds.push(animalColorId);
});

after(async () => {
  await prisma.animal.deleteMany({ where: { speciesId: { in: speciesIds } } });
  await prisma.breed.deleteMany({ where: { speciesId: { in: speciesIds } } });
  await prisma.species.deleteMany({ where: { id: { in: speciesIds } } });
  await prisma.unit.deleteMany({ where: { locationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.color.deleteMany({ where: { id: { in: colorIds } } });
  await prisma.characteristic.deleteMany({
    where: { id: { in: characteristicIds } },
  });
  await prisma.$disconnect();
});

const makeCharacteristic = async (name: string, deleted = false) => {
  const row = await prisma.characteristic.create({
    data: {
      name,
      category: CharacteristicCategory.BEHAVIOR,
      deletedAt: deleted ? deletedAt : null,
    },
    select: { id: true },
  });
  characteristicIds.push(row.id);
  return row.id;
};

const makeColor = async (name: string, deleted = false) => {
  const row = await prisma.color.create({
    data: { name, deletedAt: deleted ? deletedAt : null },
    select: { id: true },
  });
  colorIds.push(row.id);
  return row.id;
};

const makeSpecies = async (name: string, deleted = false) => {
  const row = await prisma.species.create({
    data: { name, deletedAt: deleted ? deletedAt : null },
    select: { id: true },
  });
  speciesIds.push(row.id);
  return row.id;
};

const makeBreed = async (name: string, speciesId: string, deleted = false) =>
  id(
    await prisma.breed.create({
      data: { name, speciesId, deletedAt: deleted ? deletedAt : null },
    }),
  );

const makeLocation = async (name: string, deleted = false) => {
  const row = await prisma.location.create({
    data: { name, type: LocationType.KENNEL, deletedAt: deleted ? deletedAt : null },
    select: { id: true },
  });
  locationIds.push(row.id);
  return row.id;
};

const makeUnit = async (name: string, locationId: string, deleted = false) =>
  id(
    await prisma.unit.create({
      data: { name, capacity: 1, locationId, deletedAt: deleted ? deletedAt : null },
    }),
  );

const run = (restore: (tx: TransactionClient, id: string) => Promise<string | null>, rowId: string) =>
  prisma.$transaction((tx) => restore(tx, rowId));

const deletedAtOf = {
  characteristic: async (rowId: string) =>
    (await prisma.characteristic.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
  color: async (rowId: string) =>
    (await prisma.color.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
  species: async (rowId: string) =>
    (await prisma.species.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
  breed: async (rowId: string) =>
    (await prisma.breed.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
  location: async (rowId: string) =>
    (await prisma.location.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
  unit: async (rowId: string) =>
    (await prisma.unit.findUniqueOrThrow({ where: { id: rowId } })).deletedAt,
};

// ── Characteristics ──────────────────────────────────────────────────────

test("a characteristic isn't restored beside a live one of the same name in other capitals", async () => {
  const deleted = await makeCharacteristic(`Reactive on leash ${runId}`, true);
  await makeCharacteristic(`reactive on leash ${runId}`);

  assert.equal(
    await run(restoreCharacteristic, deleted),
    `Can't restore "Reactive on leash ${runId}": a characteristic named "reactive on leash ${runId}" already exists. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.characteristic(deleted));
});

test("a characteristic is restored when the only one of its name is deleted too", async () => {
  const deleted = await makeCharacteristic(`Leash puller ${runId}`, true);
  await makeCharacteristic(`LEASH PULLER ${runId}`, true);

  assert.equal(await run(restoreCharacteristic, deleted), null);
  assert.equal(await deletedAtOf.characteristic(deleted), null);
});

// ── Colors ───────────────────────────────────────────────────────────────

test("a color isn't restored beside a live one of the same name in other capitals", async () => {
  const deleted = await makeColor(`Brindle ${runId}`, true);
  await makeColor(`BRINDLE ${runId}`);

  assert.equal(
    await run(restoreColor, deleted),
    `Can't restore "Brindle ${runId}": a color named "BRINDLE ${runId}" already exists. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.color(deleted));
});

test("a color with no live namesake is restored", async () => {
  const deleted = await makeColor(`Merle ${runId}`, true);

  assert.equal(await run(restoreColor, deleted), null);
  assert.equal(await deletedAtOf.color(deleted), null);
});

// ── Species ──────────────────────────────────────────────────────────────

test("a species isn't restored beside a live one of the same name in other capitals", async () => {
  const deleted = await makeSpecies(`Ferret ${runId}`, true);
  await makeSpecies(`ferret ${runId}`);

  assert.equal(
    await run(restoreSpecies, deleted),
    `Can't restore "Ferret ${runId}": a species named "ferret ${runId}" already exists. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.species(deleted));
});

test("a species with no live namesake is restored", async () => {
  const deleted = await makeSpecies(`Hedgehog ${runId}`, true);

  assert.equal(await run(restoreSpecies, deleted), null);
  assert.equal(await deletedAtOf.species(deleted), null);
});

// ── Breeds ───────────────────────────────────────────────────────────────

test("a breed isn't restored beside a live one of the same name in its species", async () => {
  const species = await makeSpecies(`Breed dup species ${runId}`);
  const deleted = await makeBreed("Beagle", species, true);
  await makeBreed("BEAGLE", species);

  assert.equal(
    await run(restoreBreed, deleted),
    `Can't restore "Beagle": a breed named "BEAGLE" already exists for this species. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.breed(deleted));
});

test("a breed is restored when its namesake belongs to another species", async () => {
  const species = await makeSpecies(`Breed own species ${runId}`);
  const other = await makeSpecies(`Breed other species ${runId}`);
  const deleted = await makeBreed("Shorthair", species, true);
  await makeBreed("shorthair", other);

  assert.equal(await run(restoreBreed, deleted), null);
  assert.equal(await deletedAtOf.breed(deleted), null);
});

test("a breed of a deleted species isn't restored until the species is", async () => {
  const species = await makeSpecies(`Breed deleted species ${runId}`, true);
  const deleted = await makeBreed("Lop", species, true);

  assert.equal(await run(restoreBreed, deleted), BREED_SPECIES_DELETED);
  assert.ok(await deletedAtOf.breed(deleted));

  assert.equal(await run(restoreSpecies, species), null);
  assert.equal(await run(restoreBreed, deleted), null);
  assert.equal(await deletedAtOf.breed(deleted), null);
});

test("a breed isn't added under a deleted species", async () => {
  const species = await makeSpecies(`Add deleted species ${runId}`, true);

  assert.equal(
    await prisma.$transaction((tx) =>
      addBreed(tx, { name: "Lop", speciesId: species, typicalSize: null }),
    ),
    BREED_SPECIES_GONE,
  );
  assert.equal(await prisma.breed.count({ where: { speciesId: species } }), 0);
});

test("a breed isn't added beside a live one of the same name in other capitals", async () => {
  const species = await makeSpecies(`Add dup species ${runId}`);
  await makeBreed("Dutch", species);

  assert.equal(
    await prisma.$transaction((tx) =>
      addBreed(tx, { name: "DUTCH", speciesId: species, typicalSize: null }),
    ),
    BREED_NAME_TAKEN,
  );
  assert.equal(await prisma.breed.count({ where: { speciesId: species } }), 1);
});

test("a breed isn't moved to a deleted species", async () => {
  const species = await makeSpecies(`Move from species ${runId}`);
  const deletedSpecies = await makeSpecies(`Move to deleted ${runId}`, true);
  const breed = await makeBreed("Rex", species);

  assert.equal(
    await prisma.$transaction((tx) =>
      editBreed(tx, breed, {
        name: "Rex",
        speciesId: deletedSpecies,
        typicalSize: null,
      }),
    ),
    BREED_SPECIES_GONE,
  );
  const row = await prisma.breed.findUniqueOrThrow({ where: { id: breed } });
  assert.equal(row.speciesId, species);
});

test("a breed is renamed to its own name in other capitals", async () => {
  const species = await makeSpecies(`Rename own species ${runId}`);
  const breed = await makeBreed("Mini lop", species);

  assert.equal(
    await prisma.$transaction((tx) =>
      editBreed(tx, breed, {
        name: "Mini Lop",
        speciesId: species,
        typicalSize: null,
      }),
    ),
    null,
  );
  const row = await prisma.breed.findUniqueOrThrow({ where: { id: breed } });
  assert.equal(row.name, "Mini Lop");
});

// ── Species delete ───────────────────────────────────────────────────────

test("a species with a live breed isn't deleted", async () => {
  const species = await makeSpecies(`Delete with breed ${runId}`);
  await makeBreed("Rex", species);

  assert.equal(await run(deleteSpeciesIfUnused, species), SPECIES_IN_USE);
  assert.equal(await deletedAtOf.species(species), null);
});

test("a species with an animal isn't deleted", async () => {
  const species = await makeSpecies(`Delete with animal ${runId}`);
  await prisma.animal.create({
    data: {
      name: `Catalog animal ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId: species,
      primaryColorId: animalColorId,
      listingStatus: AnimalListingStatus.PUBLISHED,
    },
  });

  assert.equal(await run(deleteSpeciesIfUnused, species), SPECIES_IN_USE);
  assert.equal(await deletedAtOf.species(species), null);
});

test("a species whose breeds are all deleted is deleted", async () => {
  const species = await makeSpecies(`Delete empty ${runId}`);
  await makeBreed("Angora", species, true);

  assert.equal(await run(deleteSpeciesIfUnused, species), null);
  assert.ok(await deletedAtOf.species(species));
});

// ── Locations and units ──────────────────────────────────────────────────

test("a location isn't restored beside a live one of the same name in other capitals", async () => {
  const deleted = await makeLocation(`North kennels ${runId}`, true);
  await makeLocation(`north KENNELS ${runId}`);

  assert.equal(
    await run(restoreLocation, deleted),
    `Can't restore "North kennels ${runId}": a location named "north KENNELS ${runId}" already exists. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.location(deleted));
});

test("a location with no live namesake is restored", async () => {
  const deleted = await makeLocation(`South kennels ${runId}`, true);

  assert.equal(await run(restoreLocation, deleted), null);
  assert.equal(await deletedAtOf.location(deleted), null);
});

test("a unit isn't restored beside a live one of the same name in its location", async () => {
  const location = await makeLocation(`Unit dup kennels ${runId}`);
  const deleted = await makeUnit("A1", location, true);
  await makeUnit("a1", location);

  assert.equal(
    await run(restoreUnit, deleted),
    `Can't restore "A1": a unit named "a1" already exists in this location. Rename or delete that one first.`,
  );
  assert.ok(await deletedAtOf.unit(deleted));
});

test("a unit is restored when its namesake is in another location", async () => {
  const location = await makeLocation(`Unit own kennels ${runId}`);
  const other = await makeLocation(`Unit other kennels ${runId}`);
  const deleted = await makeUnit("B2", location, true);
  await makeUnit("b2", other);

  assert.equal(await run(restoreUnit, deleted), null);
  assert.equal(await deletedAtOf.unit(deleted), null);
});

// ── Every catalog alike ──────────────────────────────────────────────────

type Restore = (tx: TransactionClient, id: string) => Promise<string | null>;
type DeletedAtOf = (rowId: string) => Promise<Date | null>;

/**
 * For each catalog, its restore, how to read a row's `deletedAt`, and how to
 * make a row of it (breeds and units under a live parent made here).
 */
const catalogs = async (label: string) => {
  const species = await makeSpecies(`${label} breed species ${runId}`);
  const location = await makeLocation(`${label} unit location ${runId}`);
  const rows: [
    string,
    Restore,
    DeletedAtOf,
    (name: string, deleted?: boolean) => Promise<string>,
  ][] = [
    ["characteristic", restoreCharacteristic, deletedAtOf.characteristic, makeCharacteristic],
    ["color", restoreColor, deletedAtOf.color, makeColor],
    ["species", restoreSpecies, deletedAtOf.species, makeSpecies],
    ["breed", restoreBreed, deletedAtOf.breed, (name, deleted) => makeBreed(name, species, deleted)],
    ["location", restoreLocation, deletedAtOf.location, makeLocation],
    ["unit", restoreUnit, deletedAtOf.unit, (name, deleted) => makeUnit(name, location, deleted)],
  ];
  return rows;
};

test("a row that is already live is restored as it is, not refused as its own namesake", async () => {
  for (const [kind, restore, deletedAtOfRow, make] of await catalogs("Live")) {
    const live = await make(`Already live ${kind} ${runId}`);

    assert.equal(await run(restore, live), null, kind);
    assert.equal(await deletedAtOfRow(live), null, kind);
  }
});

test("a row is restored when the only other one of its name is deleted too", async () => {
  for (const [kind, restore, deletedAtOfRow, make] of await catalogs("Namesake")) {
    const deleted = await make(`Twice deleted ${kind} ${runId}`, true);
    const namesake = await make(`TWICE DELETED ${kind} ${runId}`, true);

    assert.equal(await run(restore, deleted), null, kind);
    assert.equal(await deletedAtOfRow(deleted), null, kind);
    assert.ok(await deletedAtOfRow(namesake), kind);
  }
});

// A row deleted for good, or a stale id, makes these throw inside the
// transaction; each action's catch shows it as "Database Error: …".
const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";

test("restoring a row that doesn't exist throws, and changes nothing", async () => {
  const missing = `missing${runId}`;
  for (const [kind, restore] of await catalogs("Missing")) {
    await assert.rejects(run(restore, missing), isNotFound, kind);
  }
});

test("deleting a species, or editing a breed, that doesn't exist throws", async () => {
  const missing = `missing${runId}`;
  const species = await makeSpecies(`Missing edit species ${runId}`);

  await assert.rejects(run(deleteSpeciesIfUnused, missing), isNotFound);
  await assert.rejects(
    prisma.$transaction((tx) =>
      editBreed(tx, missing, { name: "Rex", speciesId: species, typicalSize: null }),
    ),
    isNotFound,
  );
  assert.equal(await prisma.breed.count({ where: { speciesId: species } }), 0);
});

// ── Names with LIKE's special characters ─────────────────────────────────

// Each catalog's finder, given a live row named `live`, says whether `name`
// is taken. Prisma's insensitive `equals` is an ILIKE, where `_` and `%` match
// any character and a trailing `\` is an error; the finders compare names.
const nameTakers = async (label: string): Promise<
  [string, (live: string) => Promise<(name: string) => Promise<boolean>>][]
> => {
  const species = await makeSpecies(`${label} breed species ${runId}`);
  const location = await makeLocation(`${label} unit location ${runId}`);
  const taken = (found: { id: string } | null) => found !== null;
  return [
    ["characteristic", async (live) => {
      await makeCharacteristic(live);
      return async (name) => taken(await findLiveCharacteristicNamed(prisma, name));
    }],
    ["color", async (live) => {
      await makeColor(live);
      return async (name) => taken(await findLiveColorNamed(prisma, name));
    }],
    ["species", async (live) => {
      await makeSpecies(live);
      return async (name) => taken(await findLiveSpeciesNamed(prisma, name));
    }],
    ["breed", async (live) => {
      await makeBreed(live, species);
      return async (name) => taken(await findLiveBreedNamed(prisma, name, species));
    }],
    ["location", async (live) => {
      await makeLocation(live);
      return async (name) => taken(await findLiveLocationNamed(prisma, name));
    }],
    ["unit", async (live) => {
      await makeUnit(live, location);
      return async (name) => taken(await findLiveUnitNamed(prisma, name, location));
    }],
  ];
};

test("an underscore or a percent sign in a name matches only itself", async () => {
  for (const [kind, liveRow] of await nameTakers("Wildcard")) {
    const isTaken = await liveRow(`Tanzx ${kind} ${runId}`);
    assert.equal(await isTaken(`Tan_x ${kind} ${runId}`), false, kind);
    assert.equal(await isTaken(`Tan% ${kind} ${runId}`), false, kind);
    assert.equal(await isTaken(`TANZX ${kind} ${runId}`), true, kind);

    const isTakenToo = await liveRow(`Run_1% ${kind} ${runId}`);
    assert.equal(await isTakenToo(`run_1% ${kind} ${runId}`), true, kind);
  }
});

test("a name ending in a backslash is compared, not refused with an error", async () => {
  for (const [kind, liveRow] of await nameTakers("Backslash")) {
    const isTaken = await liveRow(`${runId} ${kind} Back\\`);
    assert.equal(await isTaken(`${runId} ${kind} BACK\\`), true, kind);
    assert.equal(await isTaken(`${runId} ${kind} Other\\`), false, kind);
  }
});

test("a row whose name has an underscore is restored beside one that differs there", async () => {
  const deleted = await makeColor(`Tan_x restore ${runId}`, true);
  await makeColor(`Tanzx restore ${runId}`);

  assert.equal(await run(restoreColor, deleted), null);
  assert.equal(await deletedAtOf.color(deleted), null);
});

// ── Species and breed at the same moment ─────────────────────────────────

// Longer than the five seconds `waitForSessionBlockedBy` may take, so a slow
// machine fails on the wait, not on a transaction timeout.
const lockWaitTimeout = 20_000;

const heldOpen = new Set<{ release: () => void; done: Promise<void> }>();

/**
 * Runs `work` in a transaction and keeps it open, holding whatever it locked,
 * until `release` is called.
 */
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

// The only proof a statement reached the lock and is blocked there. Asking
// which sessions `holderPid` blocks keeps another test file's wait from
// passing for this one.
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

test("a species delete waits for a breed restore, then sees the breed and refuses", async () => {
  const species = await makeSpecies(`Race restore first ${runId}`);
  const breed = await makeBreed("Rex", species, true);

  const restore = await holdOpen(async (tx) => ({
    refusal: await restoreBreed(tx, breed),
    pid: await backendPid(tx),
  }));
  assert.equal(restore.result.refusal, null);

  const deletion = prisma.$transaction(
    (tx) => deleteSpeciesIfUnused(tx, species),
    { timeout: lockWaitTimeout },
  );
  void deletion.catch(() => {});
  await waitForSessionBlockedBy(restore.result.pid);

  restore.release();
  await restore.done;
  assert.equal(await deletion, SPECIES_IN_USE);
  assert.equal(await deletedAtOf.species(species), null);
  assert.equal(await deletedAtOf.breed(breed), null);
});

test("a breed restore waits for a species delete, then is refused", async () => {
  const species = await makeSpecies(`Race delete first ${runId}`);
  const breed = await makeBreed("Rex", species, true);

  const deletion = await holdOpen(async (tx) => ({
    refusal: await deleteSpeciesIfUnused(tx, species),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.refusal, null);

  const restore = prisma.$transaction((tx) => restoreBreed(tx, breed), {
    timeout: lockWaitTimeout,
  });
  void restore.catch(() => {});
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await restore, BREED_SPECIES_DELETED);
  assert.ok(await deletedAtOf.species(species));
  assert.ok(await deletedAtOf.breed(breed));
});

test("a species delete waits for a breed being added, then sees it and refuses", async () => {
  const species = await makeSpecies(`Race add first ${runId}`);

  const adding = await holdOpen(async (tx) => ({
    refusal: await addBreed(tx, { name: "Rex", speciesId: species, typicalSize: null }),
    pid: await backendPid(tx),
  }));
  assert.equal(adding.result.refusal, null);

  const deletion = prisma.$transaction(
    (tx) => deleteSpeciesIfUnused(tx, species),
    { timeout: lockWaitTimeout },
  );
  void deletion.catch(() => {});
  await waitForSessionBlockedBy(adding.result.pid);

  adding.release();
  await adding.done;
  assert.equal(await deletion, SPECIES_IN_USE);
  assert.equal(await deletedAtOf.species(species), null);
});

test("a breed being added waits for a species delete, then is refused", async () => {
  const species = await makeSpecies(`Race delete before add ${runId}`);

  const deletion = await holdOpen(async (tx) => ({
    refusal: await deleteSpeciesIfUnused(tx, species),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.refusal, null);

  const adding = prisma.$transaction(
    (tx) => addBreed(tx, { name: "Rex", speciesId: species, typicalSize: null }),
    { timeout: lockWaitTimeout },
  );
  void adding.catch(() => {});
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await adding, BREED_SPECIES_GONE);
  assert.equal(await prisma.breed.count({ where: { speciesId: species } }), 0);
});

test("a breed being moved waits for a species delete, then is refused", async () => {
  const from = await makeSpecies(`Race move from ${runId}`);
  const to = await makeSpecies(`Race move to ${runId}`);
  const breed = await makeBreed("Rex", from);

  const deletion = await holdOpen(async (tx) => ({
    refusal: await deleteSpeciesIfUnused(tx, to),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.refusal, null);

  const moving = prisma.$transaction(
    (tx) => editBreed(tx, breed, { name: "Rex", speciesId: to, typicalSize: null }),
    { timeout: lockWaitTimeout },
  );
  void moving.catch(() => {});
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await moving, BREED_SPECIES_GONE);
  const row = await prisma.breed.findUniqueOrThrow({ where: { id: breed } });
  assert.equal(row.speciesId, from);
});
