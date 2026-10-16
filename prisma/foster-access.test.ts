// Whether a person fosters an animal now. Every foster read and write goes
// through this one rule, so what matters is what it answers as placements
// open and close through the services that close them: a return, an outcome,
// and an outcome reversal that reopens one.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  FosterReturnReason,
  FosterStatus,
  IntakeType,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  checkFostering,
  findOpenPlacement,
  NOT_FOSTERING_MESSAGE,
} from "@/app/lib/data/fosters/foster-access";
import { isFosteringAnimal } from "@/app/lib/auth/ownership";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { recordFosterReturn } from "@/app/lib/services/foster-return";
import { recordOutcome } from "@/app/lib/services/outcome-recording";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";

const runId = Date.now().toString(36);

const INTAKE_DAY = "2026-01-01";
const PLACEMENT_START = "2026-01-05";

let speciesId: string;
let colorId: string;
let locationId: string;
let unitId: string;
let staffId: string;
let fosterId: string;
let fosterProfileId: string;
let pausedFosterId: string;
let pausedProfileId: string;
let strangerId: string;

before(async () => {
  const person = async (name: string) =>
    (
      await prisma.person.create({
        data: { name: `${name} ${runId}` },
        select: { id: true },
      })
    ).id;
  const profile = async (personId: string, status: FosterStatus) =>
    (
      await prisma.fosterProfile.create({
        data: { personId, status, maxAnimals: 50 },
        select: { id: true },
      })
    ).id;
  speciesId = (
    await prisma.species.create({
      data: { name: `Foster access species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Foster access color ${runId}` },
      select: { id: true },
    })
  ).id;
  locationId = (
    await prisma.location.create({
      data: { name: `Foster access location ${runId}`, type: LocationType.KENNEL },
      select: { id: true },
    })
  ).id;
  unitId = (
    await prisma.unit.create({
      data: { name: `Unit ${runId}`, locationId },
      select: { id: true },
    })
  ).id;
  staffId = await person("Foster access staff");
  fosterId = await person("Foster access foster");
  fosterProfileId = await profile(fosterId, FosterStatus.ACTIVE);
  pausedFosterId = await person("Foster access paused foster");
  pausedProfileId = await profile(pausedFosterId, FosterStatus.PAUSED);
  strangerId = await person("Foster access stranger");
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({
    where: { fosterProfileId: { in: [fosterProfileId, pausedProfileId] } },
  });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({
    where: { id: { in: [fosterProfileId, pausedProfileId] } },
  });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterId, pausedFosterId, strangerId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** An animal that arrived on INTAKE_DAY and went to `profileId`'s foster on
 * PLACEMENT_START, out of any unit, as placing it leaves it. */
const placeAnimal = async (label: string, profileId = fosterProfileId) => {
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus: AnimalListingStatus.PUBLISHED,
      intake: {
        create: { type: IntakeType.STRAY, intakeDate: INTAKE_DAY, staffMemberId: staffId },
      },
    },
    select: { id: true },
  });
  const placement = await prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.GENERAL,
      startDate: PLACEMENT_START,
      animalId: animal.id,
      fosterProfileId: profileId,
      placedById: staffId,
    },
    select: { id: true },
  });
  return { animalId: animal.id, placementId: placement.id };
};

/** What a foster write sees: the rule read behind the animal's lock. */
const checkUnderLock = (personId: string, animalId: string) =>
  prisma.$transaction(async (tx) => {
    await lockAnimal(tx, animalId);
    return checkFostering(tx, personId, animalId);
  });

const refusedAsNotFostering = (error: unknown) => {
  if (!(error instanceof MedicalEntryRefusal)) throw error;
  assert.equal(error.message, NOT_FOSTERING_MESSAGE);
  assert.equal(error.field, undefined);
  return true;
};

/** Asserts the person fosters the animal under `placementId`, by every
 * reader of the rule. */
const assertFostering = async (personId: string, animalId: string, placementId: string) => {
  const expected = { id: placementId, startDate: PLACEMENT_START };
  assert.deepEqual(await findOpenPlacement(prisma, personId, animalId), expected);
  assert.deepEqual(await checkUnderLock(personId, animalId), expected);
  assert.equal(await isFosteringAnimal(personId, animalId), true);
};

const assertNotFostering = async (personId: string, animalId: string) => {
  assert.equal(await findOpenPlacement(prisma, personId, animalId), null);
  await assert.rejects(checkUnderLock(personId, animalId), refusedAsNotFostering);
  assert.equal(await isFosteringAnimal(personId, animalId), false);
};

const recordDeath = (animalId: string, outcomeDate: string) =>
  prisma.$transaction((tx) =>
    recordOutcome(
      tx,
      {
        animalId,
        values: OutcomeFormSchema.parse({
          outcomeType: OutcomeType.DECEASED,
          outcomeDate,
          notes: "",
        }),
      },
      staffId,
    ),
  );

test("the foster's open placement is found, with its start day", async () => {
  const { animalId, placementId } = await placeAnimal("Fostered");
  await assertFostering(fosterId, animalId, placementId);
});

test("another person's placement is refused, and so is an animal placed with nobody", async () => {
  const { animalId } = await placeAnimal("Someone else's foster");
  await assertNotFostering(strangerId, animalId);
  await assertNotFostering(pausedFosterId, animalId);

  const { animalId: otherAnimalId } = await placeAnimal("Another foster animal");
  // The foster's own placement of one animal says nothing about another.
  const unplaced = await prisma.animal.create({
    data: {
      name: `In the shelter ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.MALE,
      speciesId,
      primaryColorId: colorId,
    },
    select: { id: true },
  });
  await assertNotFostering(fosterId, unplaced.id);
  assert.notEqual(await findOpenPlacement(prisma, fosterId, otherAnimalId), null);
});

test("a returned placement is refused", async () => {
  const { animalId, placementId } = await placeAnimal("Returned from foster");
  await assertFostering(fosterId, animalId, placementId);

  await prisma.$transaction((tx) =>
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

  await assertNotFostering(fosterId, animalId);
});

test("a placement an outcome closed is refused, and found again once the outcome is reversed", async () => {
  const { animalId, placementId } = await placeAnimal("Recorded dead in foster by mistake");

  await recordDeath(animalId, "2026-01-10");
  await assertNotFostering(fosterId, animalId);

  const { id: outcomeId } = await prisma.outcome.findFirstOrThrow({
    where: { animalId },
    select: { id: true },
  });
  const reversal = await prisma.$transaction((tx) =>
    recordOutcomeReversal(tx, outcomeId, "Entered by mistake.", staffId),
  );
  assert.equal(reversal.reopenedPlacementId, placementId);

  await assertFostering(fosterId, animalId, placementId);
});

test("a paused or inactive foster's open placement is still found", async () => {
  const { animalId, placementId } = await placeAnimal("Fostered while paused", pausedProfileId);
  await assertFostering(pausedFosterId, animalId, placementId);

  await prisma.fosterProfile.update({
    where: { id: pausedProfileId },
    data: { status: FosterStatus.INACTIVE },
  });
  try {
    await assertFostering(pausedFosterId, animalId, placementId);
  } finally {
    await prisma.fosterProfile.update({
      where: { id: pausedProfileId },
      data: { status: FosterStatus.PAUSED },
    });
  }
});

test("an empty person id is refused, never read as any foster", async () => {
  const { animalId } = await placeAnimal("Fostered, asked about with no person");
  await assertNotFostering("", animalId);
  // Prisma drops an undefined filter, so one that slipped past the types
  // would match every foster's placement of the animal.
  await assertNotFostering(undefined as unknown as string, animalId);
  assert.equal(await findOpenPlacement(prisma, fosterId, ""), null);
});
