// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. What is under test is a move racing an
// outcome on the animal's row lock, which only a real Postgres shows.
//
// `moveAnimal` is the whole of the board's move action bar the session check,
// the occupancy count and the cache invalidation, so driving it is driving the
// action.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import { AnimalArchivedError, moveAnimal } from "@/app/lib/services/animal-move";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { deleteUnitIfEmpty } from "@/app/lib/services/unit-housing";
import {
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
const locationIds: string[] = [];

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Move species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Move color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Move staff ${runId}` },
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

const makeAnimal = async (
  label: string,
  {
    listingStatus = AnimalListingStatus.PUBLISHED,
    currentUnitId,
  }: { listingStatus?: AnimalListingStatus; currentUnitId?: string } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
        currentUnitId,
      },
      select: { id: true },
    })
  ).id;

/** A unit in a location of its own, with the label a log row gives it. */
const makeUnit = async () => {
  const locationName = `Move kennels ${runId} ${locationIds.length + 1}`;
  const location = await prisma.location.create({
    data: { name: locationName, type: LocationType.KENNEL },
    select: { id: true },
  });
  locationIds.push(location.id);
  const unit = await prisma.unit.create({
    data: { name: "C1", capacity: 2, locationId: location.id },
    select: { id: true },
  });
  return { id: unit.id, label: `${locationName} · C1` };
};

const unitOf = async (animalId: string) =>
  (
    await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { currentUnitId: true },
    })
  ).currentUnitId;

const locationRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.LOCATION_CHANGE },
    select: { changedById: true, changeSummary: true },
  });

const move = (
  animalId: string,
  unitId: string | null,
  options?: { timeout: number },
) =>
  prisma.$transaction(
    (tx) => moveAnimal(tx, animalId, unitId, staffId),
    options,
  );

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
// other animal (the files run in parallel) from passing for this one.
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

test("an animal is placed in a unit, and the move is logged", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Settling in");

  const target = await move(animalId, unit.id);

  assert.equal(target?.id, unit.id);
  assert.equal(await unitOf(animalId), unit.id);
  assert.deepEqual(await locationRows(animalId), [
    { changedById: staffId, changeSummary: `Moved to ${unit.label}.` },
  ]);
});

test("an archived animal is not placed in a unit", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Gone home", {
    listingStatus: AnimalListingStatus.ARCHIVED,
  });

  await assert.rejects(move(animalId, unit.id), (error) => {
    assert.ok(error instanceof AnimalArchivedError);
    assert.ok(error instanceof PreconditionFailedError);
    assert.equal(
      error.message,
      "This animal has left the shelter, so it can't be placed in a unit.",
    );
    return true;
  });
  assert.equal(await unitOf(animalId), null);
  assert.deepEqual(await locationRows(animalId), []);
});

test("an archived animal left in a unit can be taken out to Unplaced", async () => {
  const unit = await makeUnit();
  // Left by a board move made before an archived animal was refused.
  const animalId = await makeAnimal("Left behind", {
    listingStatus: AnimalListingStatus.ARCHIVED,
    currentUnitId: unit.id,
  });

  assert.equal(await move(animalId, null), null);
  assert.equal(await unitOf(animalId), null);
  assert.deepEqual(await locationRows(animalId), [
    {
      changedById: staffId,
      changeSummary: `Removed from ${unit.label} (now unplaced).`,
    },
  ]);
});

test("a move waits for an outcome being recorded, then is refused", async () => {
  const housed = await makeUnit();
  const target = await makeUnit();
  const animalId = await makeAnimal("Just adopted", {
    currentUnitId: housed.id,
  });

  // What recording an outcome does to the animal, behind the same lock, not
  // yet committed.
  const outcome = await holdOpen(async (tx) => {
    await lockAnimal(tx, animalId);
    await tx.outcome.create({
      data: {
        animalId,
        type: OutcomeType.TRANSFER_OUT,
        outcomeDate: "2026-09-01",
        staffMemberId: staffId,
        previousListingStatus: AnimalListingStatus.PUBLISHED,
        previousUnitId: housed.id,
      },
    });
    await tx.animal.update({
      where: { id: animalId },
      data: {
        listingStatus: AnimalListingStatus.ARCHIVED,
        archiveReason: OutcomeType.TRANSFER_OUT,
        currentUnitId: null,
      },
    });
    return backendPid(tx);
  });

  const moving = move(animalId, target.id, { timeout: lockWaitTimeout });
  // Observed before the outcome is released, so it cannot be an unhandled
  // rejection while the test waits.
  const refused = assert.rejects(moving, AnimalArchivedError);
  await waitForSessionBlockedBy(outcome.result);

  outcome.release();
  await outcome.done;
  await refused;
  assert.equal(await unitOf(animalId), null);
  assert.deepEqual(await locationRows(animalId), []);
});

test("a move to a deleted unit is still refused", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Turned away");
  await prisma.$transaction((tx) => deleteUnitIfEmpty(tx, unit.id));

  await assert.rejects(move(animalId, unit.id), (error) => {
    assert.ok(error instanceof PreconditionFailedError);
    assert.ok(!(error instanceof AnimalArchivedError));
    assert.equal(error.message, "That unit is no longer available.");
    return true;
  });
  assert.equal(await unitOf(animalId), null);
  assert.deepEqual(await locationRows(animalId), []);
});

test("a move of a missing animal is still refused", async () => {
  const unit = await makeUnit();

  await assert.rejects(
    move("cmissinganimal000000000000", unit.id),
    NotFoundError,
  );
});
