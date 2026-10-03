// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. The shelter board is three reads of the live
// animals: those housed in each unit, those with no unit and no foster, and
// those in foster. An animal that has left the shelter is archived, and must
// be on none of them, whatever its unit or foster placement still says.
//
// `queryShelterBoard` is the whole of `fetchShelterBoard` bar the permission
// check, so driving it is driving the page's data.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  LocationType,
  Sex,
} from "@/prisma/generated/enums";
import { queryShelterBoard } from "@/app/lib/data/locations/shelter-board";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterProfileId: string;
const locationIds: string[] = [];

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Board species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Board color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Board staff ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: `Board foster ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.unit.deleteMany({ where: { locationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** A unit in a location of its own. */
const makeUnit = async () => {
  const location = await prisma.location.create({
    data: {
      name: `Board kennels ${runId} ${locationIds.length + 1}`,
      type: LocationType.KENNEL,
    },
    select: { id: true },
  });
  locationIds.push(location.id);
  const unit = await prisma.unit.create({
    data: { name: "B1", capacity: 2, locationId: location.id },
    select: { id: true },
  });
  return { locationId: location.id, unitId: unit.id };
};

const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus,
  currentUnitId?: string,
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

const placeInFoster = (animalId: string) =>
  prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.GENERAL,
      startDate: "2026-08-01",
      animalId,
      fosterProfileId,
      placedById: staffId,
    },
  });

const ids = (animals: { id: string }[]) => animals.map((animal) => animal.id);

test("an archived animal is left out of the unit it still points at", async () => {
  const { locationId, unitId } = await makeUnit();
  const housed = await makeAnimal(
    "Housed",
    AnimalListingStatus.PUBLISHED,
    unitId,
  );
  await makeAnimal("Gone from its unit", AnimalListingStatus.ARCHIVED, unitId);

  const board = await queryShelterBoard();

  const unit = board.locations
    .find((location) => location.id === locationId)
    ?.units.find((candidate) => candidate.id === unitId);
  assert.ok(unit, "The unit is on the board.");
  assert.deepEqual(ids(unit.animals), [housed]);
});

test("an archived animal with no unit is not listed as unplaced", async () => {
  const waiting = await makeAnimal("Waiting", AnimalListingStatus.DRAFT);
  const gone = await makeAnimal("Gone", AnimalListingStatus.ARCHIVED);

  const board = await queryShelterBoard();

  const unplaced = ids(board.unplaced);
  assert.ok(unplaced.includes(waiting), "The animal in care is unplaced.");
  assert.ok(!unplaced.includes(gone), "The archived animal is not.");
  assert.equal(board.totals.unplaced, board.unplaced.length);
});

test("an archived animal with an open foster placement is not listed as in foster, and one in care is listed there alone", async () => {
  const fostered = await makeAnimal("Fostered", AnimalListingStatus.PUBLISHED);
  await placeInFoster(fostered);
  const gone = await makeAnimal("Gone from foster", AnimalListingStatus.ARCHIVED);
  await placeInFoster(gone);

  const board = await queryShelterBoard();

  const inFoster = ids(board.fostered);
  assert.ok(inFoster.includes(fostered), "The animal in foster is listed.");
  assert.ok(!inFoster.includes(gone), "The archived animal is not.");
  assert.ok(
    !ids(board.unplaced).includes(fostered),
    "An animal in foster is not also unplaced.",
  );
});
