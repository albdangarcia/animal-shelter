// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. Making a placement reads the animal's listing
// behind its row lock and writes the listing, the unit and the placement, and
// what matters after a refusal is what the rows say: the animal still
// archived, no placement, no activity row.
//
// `makeFosterPlacement` is the whole of the create action bar the session
// check, the form validation and the cache invalidation.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  IntakeType,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import { makeFosterPlacement } from "@/app/lib/services/foster-placement";
import { recordOutcome } from "@/app/lib/services/outcome-recording";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";
import { PreconditionFailedError } from "@/app/lib/utils/errors";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);
const TODAY = calendarDay("2026-11-01");
const LEFT_MESSAGE =
  "This animal has already left the shelter, so it can't be placed in foster.";

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterProfileId: string;
let locationId: string;
let unitId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Foster placement species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Foster placement color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Foster placement staff ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: `Foster placement foster ${runId}` },
      select: { id: true },
    })
  ).id;
  // Room for every placement the file makes, so none is refused for capacity.
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId, maxAnimals: 20 },
      select: { id: true },
    })
  ).id;
  locationId = (
    await prisma.location.create({
      data: {
        name: `Foster placement location ${runId}`,
        type: LocationType.KENNEL,
      },
      select: { id: true },
    })
  ).id;
  unitId = (
    await prisma.unit.create({
      data: { name: `Unit ${runId}`, locationId },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { fosterProfileId } });
  await prisma.medicalEntry.deleteMany({ where: { createdById: staffId } });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

type Event = { intake: string } | { outcome: string };

/** An animal housed in the unit, with the given listing and events. */
const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus,
  events: Event[],
) => {
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus,
      archiveReason:
        listingStatus === AnimalListingStatus.ARCHIVED
          ? OutcomeType.DECEASED
          : null,
      currentUnitId:
        listingStatus === AnimalListingStatus.ARCHIVED ? null : unitId,
    },
    select: { id: true },
  });
  for (const event of events) {
    if ("intake" in event) {
      await prisma.intake.create({
        data: {
          animalId: animal.id,
          intakeDate: event.intake,
          type: IntakeType.STRAY,
          staffMemberId: staffId,
        },
      });
    } else {
      await prisma.outcome.create({
        data: {
          animalId: animal.id,
          outcomeDate: event.outcome,
          type: OutcomeType.DECEASED,
          staffMemberId: staffId,
        },
      });
    }
  }
  return animal.id;
};

const place = (
  animalId: string,
  type: FosterPlacementType,
  options?: { timeout: number },
) =>
  makeFosterPlacement(
    { animalId, fosterProfileId, type, expectedEndDate: null, notes: "" },
    staffId,
    TODAY,
    options,
  );

const readState = async (animalId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      currentUnitId: true,
      fosterPlacements: {
        select: { type: true, startDate: true, previousListingStatus: true },
      },
      activityLog: { select: { activityType: true } },
    },
  });
  return {
    listingStatus: animal.listingStatus,
    currentUnitId: animal.currentUnitId,
    placements: animal.fosterPlacements,
    activityTypes: animal.activityLog.map((row) => row.activityType),
  };
};

const refusedForLeaving = (error: unknown) => {
  // Anything else is reported as itself, not as a failed type check.
  if (!(error instanceof PreconditionFailedError)) throw error;
  assert.equal(error.message, LEFT_MESSAGE);
  return true;
};

test("a foster-to-adopt placement lists an animal in care as pending adoption", async () => {
  const animalId = await makeAnimal("In care", AnimalListingStatus.PUBLISHED, [
    { intake: "2026-08-01" },
  ]);

  await place(animalId, FosterPlacementType.FOSTER_TO_ADOPT);

  assert.deepEqual(await readState(animalId), {
    listingStatus: AnimalListingStatus.PENDING_ADOPTION,
    currentUnitId: null,
    placements: [
      {
        type: FosterPlacementType.FOSTER_TO_ADOPT,
        startDate: TODAY,
        previousListingStatus: AnimalListingStatus.PUBLISHED,
      },
    ],
    activityTypes: [AnimalActivityType.FOSTER_PLACED],
  });
  await assertNoListingMismatch(animalId);
});

test("an archived animal whose timeline ends on an intake is refused, and stays archived", async () => {
  // The state an outcome dated into a reversal's gap used to leave: archived
  // by the Aug 15 death, with the Oct 10 return after it. The timeline says
  // the animal is here, so the stay check alone would let it out.
  const animalId = await makeAnimal("Archived in gap", AnimalListingStatus.ARCHIVED, [
    { intake: "2026-08-01" },
    { intake: "2026-09-10" },
    { outcome: "2026-10-01" },
    { intake: "2026-10-10" },
    { outcome: "2026-08-15" },
  ]);

  for (const type of [
    FosterPlacementType.FOSTER_TO_ADOPT,
    FosterPlacementType.GENERAL,
  ]) {
    await assert.rejects(place(animalId, type), refusedForLeaving);
  }

  assert.deepEqual(await readState(animalId), {
    listingStatus: AnimalListingStatus.ARCHIVED,
    currentUnitId: null,
    placements: [],
    activityTypes: [],
  });
});

test("an animal that has left is refused", async () => {
  const animalId = await makeAnimal("Left", AnimalListingStatus.ARCHIVED, [
    { intake: "2026-08-01" },
    { outcome: "2026-09-01" },
  ]);

  await assert.rejects(
    place(animalId, FosterPlacementType.FOSTER_TO_ADOPT),
    refusedForLeaving,
  );

  const state = await readState(animalId);
  assert.equal(state.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.deepEqual(state.placements, []);
  assert.deepEqual(state.activityTypes, []);
  await assertNoListingMismatch(animalId);
});

/** The backend a transaction runs on, so a wait can be pinned to it. */
const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// Pinned to the holder's own backend, as in outcome-reversal.test.ts, so
// another file's wait on some other animal cannot pass for this one.
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

// An outcome recorded while the placement waits on the animal's lock
// archives the animal first. The placement must not then write over that.
test("a placement waiting on the lock is not made once an outcome archives the animal", async () => {
  const animalId = await makeAnimal("Archived while held", AnimalListingStatus.PUBLISHED, [
    { intake: "2026-08-01" },
  ]);
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      await recordOutcome(
        tx,
        {
          animalId,
          values: OutcomeFormSchema.parse({
            outcomeType: OutcomeType.OTHER,
            outcomeDate: "2026-10-01",
          }),
        },
        staffId,
      );
    },
    { timeout },
  );
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const placement = place(animalId, FosterPlacementType.FOSTER_TO_ADOPT, {
    timeout,
  }).then(
    () => ({ placed: true as const }),
    (error: unknown) => ({ error }),
  );
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    release();
  }
  await holder;
  const result = await placement;

  // The first attempt fails its serializable check, since the row it locks
  // changed after its snapshot was taken. The retry reads the archived
  // listing, and refuses for that.
  assert.ok("error" in result, "The placement was made on an archived animal.");
  assert.ok(refusedForLeaving(result.error));
  const state = await readState(animalId);
  assert.equal(state.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.deepEqual(state.placements, []);
  assert.ok(!state.activityTypes.includes(AnimalActivityType.FOSTER_PLACED));
  await assertNoListingMismatch(animalId);
});
