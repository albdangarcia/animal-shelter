// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. A return reads the animal's listing behind
// its row lock and writes the placement, the unit and the listing, and what
// matters after a refusal is what the rows say: the placement still open, the
// animal still archived and unhoused, no activity row.
//
// `recordFosterReturn` is the whole of the return action bar the session
// check, the form validation, the transaction and the cache invalidation.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  FosterReturnReason,
  IntakeType,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import { recordFosterReturn } from "@/app/lib/services/foster-return";
import { ConflictError, PreconditionFailedError } from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);

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
      data: { name: `Foster return species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Foster return color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Foster return staff ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: `Foster return foster ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
  locationId = (
    await prisma.location.create({
      data: { name: `Foster return location ${runId}`, type: LocationType.KENNEL },
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

/**
 * An animal that arrived on 2026-01-01 and is out with the foster on an open
 * placement. `leftAfterPlacement` records an outcome dated later, the way
 * recording one while the placement is open leaves the animal: archived, with
 * the placement still open.
 */
const makeFosteredAnimal = async (
  label: string,
  options: { type: FosterPlacementType; leftAfterPlacement: boolean },
) => {
  const listedBefore = AnimalListingStatus.PUBLISHED;
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus:
        options.type === FosterPlacementType.FOSTER_TO_ADOPT
          ? AnimalListingStatus.PENDING_ADOPTION
          : listedBefore,
    },
    select: { id: true },
  });
  await prisma.intake.create({
    data: {
      animalId: animal.id,
      intakeDate: "2026-01-01",
      type: IntakeType.STRAY,
      staffMemberId: staffId,
    },
  });
  const placement = await prisma.fosterPlacement.create({
    data: {
      type: options.type,
      startDate: "2026-01-05",
      animalId: animal.id,
      fosterProfileId,
      placedById: staffId,
      previousListingStatus:
        options.type === FosterPlacementType.FOSTER_TO_ADOPT
          ? listedBefore
          : undefined,
    },
    select: { id: true },
  });
  if (options.leftAfterPlacement) {
    await prisma.outcome.create({
      data: {
        animalId: animal.id,
        outcomeDate: "2026-01-10",
        type: OutcomeType.DECEASED,
        staffMemberId: staffId,
      },
    });
    await prisma.animal.update({
      where: { id: animal.id },
      data: {
        listingStatus: AnimalListingStatus.ARCHIVED,
        archiveReason: OutcomeType.DECEASED,
      },
    });
  }
  return { animalId: animal.id, placementId: placement.id };
};

const returnFromFoster = (placementId: string) =>
  prisma.$transaction((tx) =>
    recordFosterReturn(
      tx,
      {
        placementId,
        returnReason: FosterReturnReason.RETURNED_TO_SHELTER,
        returnNotes: "",
        unitId,
      },
      staffId,
    ),
  );

const readState = async (animalId: string, placementId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      currentUnitId: true,
      activityLog: { select: { activityType: true, changeSummary: true } },
    },
  });
  const placement = await prisma.fosterPlacement.findUniqueOrThrow({
    where: { id: placementId },
    select: { endDate: true, returnReason: true, returnedById: true },
  });
  return {
    listingStatus: animal.listingStatus,
    currentUnitId: animal.currentUnitId,
    activityLogs: animal.activityLog,
    placement,
  };
};

const refusedForLeaving = (error: unknown) => {
  // Anything else is reported as itself, not as a failed type check.
  if (!(error instanceof PreconditionFailedError)) throw error;
  assert.equal(
    error.message,
    "This animal has already left the shelter, so it can't be returned from foster.",
  );
  return true;
};

test("a foster-to-adopt return after an outcome is refused, and nothing is written", async () => {
  // The path that listed an animal that had left: the outcome archives it and
  // leaves the placement open, and the return would write the saved
  // PUBLISHED back and put the animal in a unit.
  const { animalId, placementId } = await makeFosteredAnimal(
    "Left in foster to adopt",
    { type: FosterPlacementType.FOSTER_TO_ADOPT, leftAfterPlacement: true },
  );
  const before = await readState(animalId, placementId);
  assert.equal(before.listingStatus, AnimalListingStatus.ARCHIVED);

  await assert.rejects(returnFromFoster(placementId), refusedForLeaving);

  assert.deepEqual(await readState(animalId, placementId), before);
  assert.equal(before.placement.endDate, null);
  assert.equal(before.currentUnitId, null);
});

test("a plain foster return after an outcome is refused too", async () => {
  // It changes no listing, but it would put an archived animal in a unit.
  const { animalId, placementId } = await makeFosteredAnimal(
    "Left in foster",
    { type: FosterPlacementType.GENERAL, leftAfterPlacement: true },
  );
  const before = await readState(animalId, placementId);

  await assert.rejects(returnFromFoster(placementId), refusedForLeaving);

  assert.deepEqual(await readState(animalId, placementId), before);
});

test("a foster-to-adopt return for an animal still in care restores its listing", async () => {
  const { animalId, placementId } = await makeFosteredAnimal(
    "Back from foster to adopt",
    { type: FosterPlacementType.FOSTER_TO_ADOPT, leftAfterPlacement: false },
  );

  await returnFromFoster(placementId);

  const after = await readState(animalId, placementId);
  assert.equal(after.listingStatus, AnimalListingStatus.PUBLISHED);
  assert.equal(after.currentUnitId, unitId);
  assert.notEqual(after.placement.endDate, null);
  assert.equal(
    after.placement.returnReason,
    FosterReturnReason.RETURNED_TO_SHELTER,
  );
  assert.equal(after.placement.returnedById, staffId);
  assert.deepEqual(
    after.activityLogs.map((log) => log.activityType),
    [AnimalActivityType.FOSTER_RETURNED],
  );
});

test("a plain foster return for an animal still in care leaves its listing alone", async () => {
  const { animalId, placementId } = await makeFosteredAnimal(
    "Back from plain foster",
    { type: FosterPlacementType.GENERAL, leftAfterPlacement: false },
  );

  await returnFromFoster(placementId);

  const after = await readState(animalId, placementId);
  assert.equal(after.listingStatus, AnimalListingStatus.PUBLISHED);
  assert.equal(after.currentUnitId, unitId);
});

test("a placement that already ended is refused as such", async () => {
  const { placementId } = await makeFosteredAnimal("Returned twice", {
    type: FosterPlacementType.GENERAL,
    leftAfterPlacement: false,
  });
  await returnFromFoster(placementId);

  await assert.rejects(returnFromFoster(placementId), (error: unknown) => {
    if (!(error instanceof ConflictError)) throw error;
    assert.equal(error.message, "This foster placement has already ended.");
    return true;
  });
});
