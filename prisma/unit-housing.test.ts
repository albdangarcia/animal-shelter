// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. What is under test is how two transactions
// interleave on the unit and location rows, which only a real Postgres shows.
//
// Every path that puts an animal in a unit reads the unit through
// `findLiveUnitForPlacement` and writes `currentUnitId` in the same
// transaction, so a transaction doing just that stands in for the board, the
// animal form and a foster return. The reversal is driven for real.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  deleteLocationIfEmpty,
  deleteUnitIfEmpty,
  findLiveUnitForPlacement,
  lockLiveLocation,
  restoreUnitIfLocationLive,
} from "@/app/lib/services/unit-housing";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
const locationIds: string[] = [];

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Housing species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Housing color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Housing staff ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.unit.deleteMany({ where: { locationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, currentUnitId?: string) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.PUBLISHED,
        currentUnitId,
      },
      select: { id: true },
    })
  ).id;

/** A unit in a location of its own. */
const makeUnit = async () => {
  const location = await prisma.location.create({
    data: {
      name: `Housing kennels ${runId} ${locationIds.length + 1}`,
      type: LocationType.KENNEL,
    },
    select: { id: true },
  });
  locationIds.push(location.id);
  const unit = await prisma.unit.create({
    data: { name: "B1", capacity: 2, locationId: location.id },
    select: { id: true },
  });
  return { id: unit.id, locationId: location.id };
};

const unitOf = async (animalId: string) =>
  (
    await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { currentUnitId: true },
    })
  ).currentUnitId;

const unitDeletedAt = async (unitId: string) =>
  (
    await prisma.unit.findUniqueOrThrow({
      where: { id: unitId },
      select: { deletedAt: true },
    })
  ).deletedAt;

const locationDeletedAt = async (locationId: string) =>
  (
    await prisma.location.findUniqueOrThrow({
      where: { id: locationId },
      select: { deletedAt: true },
    })
  ).deletedAt;

/** What each placement path does: read the unit behind its lock, then write. */
const place = (
  animalId: string,
  unitId: string,
  options?: { timeout: number },
) =>
  prisma.$transaction(async (tx) => {
    const unit = await findLiveUnitForPlacement(tx, unitId);
    if (!unit) return false;
    await tx.animal.update({
      where: { id: animalId },
      data: { currentUnitId: unit.id },
    });
    return true;
  }, options);

// Longer than the five seconds `waitForSessionBlockedBy` may take, so a slow
// machine fails on the wait, not on a transaction timeout. Given to every
// transaction `holdOpen` keeps open and to every transaction a wait depends on.
const lockWaitTimeout = 20_000;

// Every transaction `holdOpen` has not yet seen end.
const heldOpen = new Set<{ release: () => void; done: Promise<void> }>();

/**
 * Runs `work` in a transaction and keeps the transaction open, holding
 * whatever it locked, until `release` is called. A test that fails first has
 * it released after it, so the failure is not followed by a lock timeout.
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
  // `done` settles first only when `work` threw.
  const result = await Promise.race([isHeld, done as Promise<never>]);
  return { result, release, done };
};

afterEach(async () => {
  const open = [...heldOpen];
  for (const { release } of open) release();
  // Its own failure, if any, was the test's to report.
  await Promise.allSettled(open.map(({ done }) => done));
});

/** The backend a transaction runs on, so a wait can be pinned to it. */
const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// The only proof a statement reached the lock and is blocked there, rather
// than not having started yet. Asking which sessions `holderPid` blocks,
// rather than matching the lock query, keeps another test file's wait on some
// other unit (the files run in parallel) from passing for this one.
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

test("an empty unit is deleted, and a housed one is not", async () => {
  const empty = await makeUnit();
  const housed = await makeUnit();
  await makeAnimal("Resident", housed.id);

  assert.equal(await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, empty.id)), true);
  assert.ok(await unitDeletedAt(empty.id));
  assert.equal(await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, housed.id)), false);
  assert.equal(await unitDeletedAt(housed.id), null);
});

test("an animal is not placed in a deleted unit", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Turned away");
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  assert.equal(await place(animalId, unit.id), false);
  assert.equal(await unitOf(animalId), null);
});

test("an animal is not placed in a unit whose location has been deleted", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Nowhere");
  // Left by a unit restored into a deleted location before that was refused.
  await prisma.location.update({
    where: { id: unit.locationId },
    data: { deletedAt: new Date() },
  });

  assert.equal(await place(animalId, unit.id), false);
  assert.equal(await unitOf(animalId), null);
});

test("a unit delete waits for a placement, then sees the animal and refuses", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Moving in");

  // The placement has read the unit as live and written the animal, and has
  // not committed.
  const placement = await holdOpen(async (tx) => {
    const live = await findLiveUnitForPlacement(tx, unit.id);
    assert.ok(live);
    await tx.animal.update({
      where: { id: animalId },
      data: { currentUnitId: unit.id },
    });
    return backendPid(tx);
  });

  const deletion = prisma.$transaction(
    (tx) => deleteUnitIfEmpty(tx, unit.id),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(placement.result);
  assert.equal(await unitDeletedAt(unit.id), null);

  placement.release();
  await placement.done;
  assert.equal(await deletion, false);
  assert.equal(await unitDeletedAt(unit.id), null);
  assert.equal(await unitOf(animalId), unit.id);
});

test("a placement waits for a unit delete, then sees the unit deleted", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Too late");

  // The delete has counted the unit empty and marked it deleted, and has not
  // committed.
  const deletion = await holdOpen(async (tx) => ({
    deleted: await deleteUnitIfEmpty(tx, unit.id),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.deleted, true);

  const placement = place(animalId, unit.id, { timeout: lockWaitTimeout });
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await placement, false);
  assert.ok(await unitDeletedAt(unit.id));
  assert.equal(await unitOf(animalId), null);
});

test("two placements in one unit do not wait for each other", async () => {
  const unit = await makeUnit();
  const first = await makeAnimal("First in");
  const second = await makeAnimal("Second in");

  const held = await holdOpen(async (tx) => {
    assert.ok(await findLiveUnitForPlacement(tx, unit.id));
    await tx.animal.update({
      where: { id: first },
      data: { currentUnitId: unit.id },
    });
  });
  // Completes while the first still holds the unit.
  assert.equal(await place(second, unit.id), true);

  held.release();
  await held.done;
  assert.equal(await unitOf(first), unit.id);
  assert.equal(await unitOf(second), unit.id);
});

/** An outcome that took the animal out of `unitId`, as the outcome paths leave it. */
const recordOutcome = async (animalId: string, unitId: string) => {
  const outcome = await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.TRANSFER_OUT,
      outcomeDate: "2026-09-01",
      staffMemberId: staffId,
      previousListingStatus: AnimalListingStatus.PUBLISHED,
      previousUnitId: unitId,
    },
    select: { id: true },
  });
  await prisma.animal.update({
    where: { id: animalId },
    data: {
      listingStatus: AnimalListingStatus.ARCHIVED,
      archiveReason: OutcomeType.TRANSFER_OUT,
      currentUnitId: null,
    },
  });
  return outcome.id;
};

test("a unit delete waits for a reversal putting the animal back, then refuses", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Brought back", unit.id);
  const outcomeId = await recordOutcome(animalId, unit.id);

  const reversal = await holdOpen(async (tx) => ({
    reversal: await recordOutcomeReversal(
      tx,
      outcomeId,
      "Wrong animal.",
      staffId,
    ),
    pid: await backendPid(tx),
  }));
  assert.equal(reversal.result.reversal.restoredUnitId, unit.id);

  const deletion = prisma.$transaction(
    (tx) => deleteUnitIfEmpty(tx, unit.id),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(reversal.result.pid);

  reversal.release();
  await reversal.done;
  assert.equal(await deletion, false);
  assert.equal(await unitDeletedAt(unit.id), null);
  assert.equal(await unitOf(animalId), unit.id);
});

test("a reversal waits for a unit delete, then leaves the animal unhoused", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Not brought back", unit.id);
  const outcomeId = await recordOutcome(animalId, unit.id);

  const deletion = await holdOpen(async (tx) => ({
    deleted: await deleteUnitIfEmpty(tx, unit.id),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.deleted, true);

  const reversal = prisma.$transaction(
    (tx) => recordOutcomeReversal(tx, outcomeId, "Wrong animal.", staffId),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  const result = await reversal;
  assert.equal(result.restoredUnitId, null);
  assert.match(result.effects, /has been deleted; place it from its record\./);
  assert.ok(await unitDeletedAt(unit.id));
  assert.equal(await unitOf(animalId), null);
});

test("a unit is not restored into a deleted location", async () => {
  const unit = await makeUnit();
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));
  await prisma.$transaction((tx) => deleteLocationIfEmpty(tx, unit.locationId));

  assert.equal(
    await prisma.$transaction((tx) => restoreUnitIfLocationLive(tx, unit.id)),
    false,
  );
  assert.ok(await unitDeletedAt(unit.id));

  await prisma.location.update({
    where: { id: unit.locationId },
    data: { deletedAt: null },
  });
  assert.equal(
    await prisma.$transaction((tx) => restoreUnitIfLocationLive(tx, unit.id)),
    true,
  );
  assert.equal(await unitDeletedAt(unit.id), null);
});

test("a location delete waits for a unit restore, then sees the unit and refuses", async () => {
  const unit = await makeUnit();
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  const restore = await holdOpen(async (tx) => ({
    restored: await restoreUnitIfLocationLive(tx, unit.id),
    pid: await backendPid(tx),
  }));
  assert.equal(restore.result.restored, true);

  const deletion = prisma.$transaction(
    (tx) => deleteLocationIfEmpty(tx, unit.locationId),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(restore.result.pid);

  restore.release();
  await restore.done;
  assert.equal(await deletion, false);
  assert.equal(await locationDeletedAt(unit.locationId), null);
  assert.equal(await unitDeletedAt(unit.id), null);
});

test("a unit restore waits for a location delete, then is refused", async () => {
  const unit = await makeUnit();
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  const deletion = await holdOpen(async (tx) => ({
    deleted: await deleteLocationIfEmpty(tx, unit.locationId),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.deleted, true);

  const restore = prisma.$transaction(
    (tx) => restoreUnitIfLocationLive(tx, unit.id),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await restore, false);
  assert.ok(await locationDeletedAt(unit.locationId));
  assert.ok(await unitDeletedAt(unit.id));
});

/** What creating a unit does: check the location behind its lock, then insert. */
const createUnitIn = async (
  tx: TransactionClient,
  locationId: string,
  name: string,
) => {
  if (!(await lockLiveLocation(tx, locationId))) return false;
  await tx.unit.create({ data: { name, capacity: 1, locationId } });
  return true;
};

test("a location delete waits for a unit being added, then sees it and refuses", async () => {
  const unit = await makeUnit();
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  const creation = await holdOpen(async (tx) => ({
    created: await createUnitIn(tx, unit.locationId, "B2"),
    pid: await backendPid(tx),
  }));
  assert.equal(creation.result.created, true);

  const deletion = prisma.$transaction(
    (tx) => deleteLocationIfEmpty(tx, unit.locationId),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(creation.result.pid);

  creation.release();
  await creation.done;
  assert.equal(await deletion, false);
  assert.equal(await locationDeletedAt(unit.locationId), null);
});

test("a unit being added waits for a location delete, then is refused", async () => {
  const unit = await makeUnit();
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  const deletion = await holdOpen(async (tx) => ({
    deleted: await deleteLocationIfEmpty(tx, unit.locationId),
    pid: await backendPid(tx),
  }));
  assert.equal(deletion.result.deleted, true);

  const creation = prisma.$transaction(
    (tx) => createUnitIn(tx, unit.locationId, "B2"),
    { timeout: lockWaitTimeout },
  );
  await waitForSessionBlockedBy(deletion.result.pid);

  deletion.release();
  await deletion.done;
  assert.equal(await creation, false);
  assert.ok(await locationDeletedAt(unit.locationId));
  assert.equal(
    await prisma.unit.count({ where: { locationId: unit.locationId, name: "B2" } }),
    0,
  );
});
