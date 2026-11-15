// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. The dashboard's headcount cards count the
// animals in care by the shelter board's buckets (on site, in foster, not
// housed), by listing status, and sum the live units against their capacity.
// They are built from the board's own filters, so the last test checks the
// two read the same animals alike.
//
// The test files share one database and run at once, so every count is
// narrowed to this test's own animals (`animal`) and locations (`unit`).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  LocationType,
  Sex,
} from "@/prisma/generated/enums";
import { countHeadcounts } from "@/app/lib/data/animals/headcounts";
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
      data: { name: `Headcount species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Headcount color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Headcount staff ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: `Headcount foster ${runId}` },
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

/** A location of its own, with units of the given capacities. */
const makeLocation = async (capacities: number[]) => {
  const location = await prisma.location.create({
    data: {
      name: `Headcount kennels ${runId} ${locationIds.length + 1}`,
      type: LocationType.KENNEL,
    },
    select: { id: true },
  });
  locationIds.push(location.id);
  const unitIds: string[] = [];
  for (const [index, capacity] of capacities.entries()) {
    const unit = await prisma.unit.create({
      data: { name: `H${index + 1}`, capacity, locationId: location.id },
      select: { id: true },
    });
    unitIds.push(unit.id);
  }
  return { locationId: location.id, unitIds };
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

const placeInFoster = (
  animalId: string,
  type: FosterPlacementType = FosterPlacementType.GENERAL,
  endDate?: string,
) =>
  prisma.fosterPlacement.create({
    data: {
      type,
      startDate: "2026-08-01",
      endDate,
      animalId,
      fosterProfileId,
      placedById: staffId,
    },
  });

const only = (ids: string[]) => ({ animal: { id: { in: ids } } });

test("an archived animal is in none of the counts, wherever it still points", async () => {
  const {
    locationId,
    unitIds: [unitId],
  } = await makeLocation([2]);
  const inUnit = await makeAnimal("Gone from unit", AnimalListingStatus.ARCHIVED, unitId);
  const inFoster = await makeAnimal("Gone from foster", AnimalListingStatus.ARCHIVED);
  await placeInFoster(inFoster);
  const nowhere = await makeAnimal("Gone", AnimalListingStatus.ARCHIVED);

  const counts = await countHeadcounts(prisma, {
    ...only([inUnit, inFoster, nowhere]),
    unit: { locationId },
  });

  assert.equal(counts.inCare, 0);
  assert.equal(counts.onSite, 0);
  assert.equal(counts.inFoster, 0);
  assert.equal(counts.notHoused, 0);
  assert.equal(counts.published, 0);
  assert.equal(counts.drafts, 0);
  assert.equal(counts.pendingAdoption, 0);
  assert.equal(counts.units.occupied, 0, "Nor does it take a place in its unit.");
  assert.equal(counts.units.capacity, 2);
});

test("an animal in a unit with an open placement counts on site, not in foster", async () => {
  const {
    unitIds: [unitId],
  } = await makeLocation([1]);
  const animal = await makeAnimal("Housed and placed", AnimalListingStatus.PUBLISHED, unitId);
  await placeInFoster(animal);

  const counts = await countHeadcounts(prisma, only([animal]));

  assert.equal(counts.onSite, 1);
  assert.equal(counts.inFoster, 0);
  assert.equal(counts.notHoused, 0);
  assert.equal(counts.inCare, 1);
});

test("an animal with no unit is in foster while a placement is open, and not housed once it ends", async () => {
  const fostered = await makeAnimal("Fostered", AnimalListingStatus.PUBLISHED);
  await placeInFoster(fostered);
  const returned = await makeAnimal("Returned", AnimalListingStatus.DRAFT);
  await placeInFoster(returned, FosterPlacementType.GENERAL, "2026-09-01");
  const waiting = await makeAnimal("Waiting", AnimalListingStatus.DRAFT);

  const counts = await countHeadcounts(prisma, only([fostered, returned, waiting]));

  assert.equal(counts.onSite, 0);
  assert.equal(counts.inFoster, 1);
  assert.equal(counts.notHoused, 2);
  assert.equal(counts.inCare, 3);
});

test("Available counts the published, its sub-line the drafts, and Pending adoption those in foster-to-adopt", async () => {
  const published = await makeAnimal("Published", AnimalListingStatus.PUBLISHED);
  const draftA = await makeAnimal("Draft A", AnimalListingStatus.DRAFT);
  const draftB = await makeAnimal("Draft B", AnimalListingStatus.DRAFT);
  const reserved = await makeAnimal("Reserved", AnimalListingStatus.PENDING_ADOPTION);
  const fosterToAdopt = await makeAnimal(
    "Foster to adopt",
    AnimalListingStatus.PENDING_ADOPTION,
  );
  await placeInFoster(fosterToAdopt, FosterPlacementType.FOSTER_TO_ADOPT);
  // A foster-to-adopt placement that has ended no longer counts.
  const ended = await makeAnimal("Ended", AnimalListingStatus.PENDING_ADOPTION);
  await placeInFoster(ended, FosterPlacementType.FOSTER_TO_ADOPT, "2026-09-01");
  // Nor does another kind of placement.
  const general = await makeAnimal("General", AnimalListingStatus.PENDING_ADOPTION);
  await placeInFoster(general);

  const counts = await countHeadcounts(
    prisma,
    only([published, draftA, draftB, reserved, fosterToAdopt, ended, general]),
  );

  assert.equal(counts.published, 1);
  assert.equal(counts.drafts, 2);
  assert.equal(counts.pendingAdoption, 4);
  assert.equal(counts.fosterToAdopt, 1);
});

test("Space sums the live units, leaving out a deleted unit and a deleted location, and counts full and over-capacity units", async () => {
  const {
    locationId,
    unitIds: [empty, hasSpace, full, over, deleted],
  } = await makeLocation([2, 3, 1, 1, 4]);
  await prisma.unit.update({
    where: { id: deleted },
    data: { deletedAt: new Date() },
  });
  const animals = [
    await makeAnimal("Has space", AnimalListingStatus.PUBLISHED, hasSpace),
    await makeAnimal("Full", AnimalListingStatus.DRAFT, full),
    await makeAnimal("Over 1", AnimalListingStatus.PUBLISHED, over),
    await makeAnimal("Over 2", AnimalListingStatus.PENDING_ADOPTION, over),
  ];
  // A live unit in a deleted location is left out too.
  const { locationId: deletedLocationId } = await makeLocation([5]);
  await prisma.location.update({
    where: { id: deletedLocationId },
    data: { deletedAt: new Date() },
  });
  assert.ok(empty);

  const counts = await countHeadcounts(prisma, {
    ...only(animals),
    unit: { locationId: { in: [locationId, deletedLocationId] } },
  });

  assert.deepEqual(counts.units, {
    units: 4,
    occupied: 4,
    capacity: 7,
    full: 1,
    over: 1,
  });
  assert.equal(counts.onSite, 4, "Space's figure is the on-site count.");
});

test("an animal pointing at a deleted unit, or at a unit in a deleted location, is not counted on site, as on the board", async () => {
  // The app never writes this: a unit or location can't be deleted while an
  // animal points at it, and housing goes through a live-unit check. Written
  // here directly, so a filter that dropped the "live unit in a live
  // location" part of ON_SITE fails.
  const {
    unitIds: [deletedUnit],
  } = await makeLocation([3]);
  const inDeletedUnit = await makeAnimal(
    "In a deleted unit",
    AnimalListingStatus.PUBLISHED,
    deletedUnit,
  );
  await prisma.unit.update({
    where: { id: deletedUnit },
    data: { deletedAt: new Date() },
  });
  const {
    locationId: deletedLocation,
    unitIds: [unitInDeletedLocation],
  } = await makeLocation([3]);
  const inDeletedLocation = await makeAnimal(
    "In a deleted location",
    AnimalListingStatus.PUBLISHED,
    unitInDeletedLocation,
  );
  await prisma.location.update({
    where: { id: deletedLocation },
    data: { deletedAt: new Date() },
  });
  const animals = [inDeletedUnit, inDeletedLocation];

  const [counts, board] = await Promise.all([
    countHeadcounts(prisma, only(animals)),
    queryShelterBoard(),
  ]);

  assert.equal(counts.onSite, 0);
  assert.equal(counts.inFoster, 0);
  assert.equal(counts.notHoused, 0);
  const onBoard = [
    ...board.locations.flatMap((location) =>
      location.units.flatMap((unit) => unit.animals),
    ),
    ...board.fostered,
    ...board.unplaced,
  ].filter((animal) => animals.includes(animal.id));
  assert.deepEqual(onBoard, [], "Nor does the board list them anywhere.");
});

test("the counts agree with the shelter board for the same animals and units", async () => {
  const {
    locationId,
    unitIds: [unitA, unitB],
  } = await makeLocation([1, 2]);
  const animals = [
    await makeAnimal("Board A", AnimalListingStatus.PUBLISHED, unitA),
    await makeAnimal("Board B", AnimalListingStatus.DRAFT, unitB),
    await makeAnimal("Board C", AnimalListingStatus.PUBLISHED, unitB),
    await makeAnimal("Board gone", AnimalListingStatus.ARCHIVED, unitB),
    await makeAnimal("Board fostered", AnimalListingStatus.PUBLISHED),
    await makeAnimal("Board waiting", AnimalListingStatus.DRAFT),
  ];
  await placeInFoster(animals[4]);
  await placeInFoster(animals[0]); // housed and placed: on site

  const [counts, board, notArchived] = await Promise.all([
    countHeadcounts(prisma, { ...only(animals), unit: { locationId } }),
    queryShelterBoard(),
    prisma.animal.count({
      where: {
        id: { in: animals },
        listingStatus: { not: AnimalListingStatus.ARCHIVED },
      },
    }),
  ]);

  const mine = (list: { id: string }[]) =>
    list.filter((animal) => animals.includes(animal.id)).length;
  const location = board.locations.find((candidate) => candidate.id === locationId);
  assert.ok(location, "The location is on the board.");
  const boardOnSite = board.locations
    .flatMap((candidate) => candidate.units)
    .reduce((sum, unit) => sum + mine(unit.animals), 0);

  assert.equal(counts.onSite, boardOnSite);
  assert.equal(counts.inFoster, mine(board.fostered));
  assert.equal(counts.notHoused, mine(board.unplaced));
  assert.deepEqual([counts.onSite, counts.inFoster, counts.notHoused], [3, 1, 1]);

  // Space reads the units as the board does.
  assert.equal(counts.units.units, location.units.length);
  assert.equal(
    counts.units.capacity,
    location.units.reduce((sum, unit) => sum + unit.capacity, 0),
  );
  assert.equal(
    counts.units.occupied,
    location.units.reduce((sum, unit) => sum + unit.animals.length, 0),
  );

  // In care is the three buckets, and that is every animal not archived.
  assert.equal(counts.inCare, notArchived);
});
