// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. What matters after a create is what the rows
// say: the animal, its one intake and the activity rows, and after a refusal,
// that no animal was left behind.
//
// `createAnimalFromForm` is the whole of the create action bar the session
// check, the form validation and the cache invalidation, so driving it is
// driving the action. Most cases drive `recordAnimalCreation`, the write it
// makes once the first intake's day is accepted.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalHealthStatus,
  AnimalListingStatus,
  IntakeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  createAnimalFromForm,
  recordAnimalCreation,
} from "@/app/lib/services/animal-creation";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { shiftDayKey } from "@/app/lib/utils/shelter-day";
import { CreateAnimalFormSchema } from "@/app/lib/zod-schemas/animal.schemas";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

let speciesId: string;
let breedId: string;
let colorId: string;
let staffId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Creation species ${runId}` },
      select: { id: true },
    })
  ).id;
  breedId = (
    await prisma.breed.create({
      data: { name: `Creation breed ${runId}`, speciesId },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Creation color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Creation staff ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.vitalsLog.deleteMany({ where: { recordedById: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.breed.deleteMany({ where: { id: breedId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

// What the intake form would submit, parsed the way the action parses it.
const submission = (
  label: string,
  changes: Record<string, unknown> = {},
) =>
  CreateAnimalFormSchema.parse({
    animalName: `${label} ${runId}`,
    species: speciesId,
    breed: breedId,
    primaryColor: colorId,
    additionalColors: [],
    sex: Sex.FEMALE,
    estimatedBirthDate: "2024-01-01",
    healthStatus: AnimalHealthStatus.AWAITING_VET_EXAM,
    listingStatus: AnimalListingStatus.DRAFT,
    heightCm: null,
    weightGrams: null,
    isSpayedNeutered: false,
    intakeType: IntakeType.SEIZE,
    intakeDate: "2026-01-01",
    ...changes,
  });

const create = (label: string, changes: Record<string, unknown> = {}) =>
  prisma.$transaction((tx) =>
    recordAnimalCreation(tx, submission(label, changes), staffId),
  );

const readAnimal = (animalId: string) =>
  prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      publishedAt: true,
      intake: { select: { intakeDate: true, type: true } },
      Outcome: { select: { id: true } },
      activityLog: { select: { activityType: true } },
    },
  });

// Ordered by time alone, as the feed orders them, so a shared timestamp is not
// hidden behind an id tie-break.
const assertPublishFollowsIntake = async (animalId: string) => {
  const rows = await prisma.animalActivityLog.findMany({
    where: { animalId },
    select: { activityType: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  });
  assert.deepEqual(
    rows.map((row) => row.activityType),
    [AnimalActivityType.INTAKE_PROCESSED, AnimalActivityType.STATUS_CHANGE],
  );
  assert.ok(rows[1].changedAt > rows[0].changedAt);
};

test("a draft animal starts with one intake and agrees with its timeline", async () => {
  const { animalId } = await create("Draft");

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.equal(animal.publishedAt, null);
  assert.deepEqual(animal.intake, [
    { intakeDate: "2026-01-01", type: IntakeType.SEIZE },
  ]);
  assert.deepEqual(animal.Outcome, []);
  assert.deepEqual(
    animal.activityLog.map((row) => row.activityType),
    [AnimalActivityType.INTAKE_PROCESSED],
  );
  await assertNoListingMismatch(animalId);
});

test("a published animal is stamped and logged, and agrees with its timeline", async () => {
  const { animalId } = await create("Published", {
    listingStatus: AnimalListingStatus.PUBLISHED,
  });

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.PUBLISHED);
  assert.notEqual(animal.publishedAt, null);
  await assertPublishFollowsIntake(animalId);
  await assertNoListingMismatch(animalId);
});

test("a published animal created within one millisecond is still logged as admitted, then published", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let animalId: string;
  try {
    ({ animalId } = await create("Published, same millisecond", {
      listingStatus: AnimalListingStatus.PUBLISHED,
    }));
  } finally {
    t.mock.timers.reset();
  }

  await assertPublishFollowsIntake(animalId);
});

test("an intake weight is written as a dated vitals entry", async () => {
  const { animalId } = await create("Weighed", { weightGrams: 4200 });

  const [vitals] = await prisma.vitalsLog.findMany({
    where: { animalId },
    select: { weightGrams: true, recordedById: true },
  });
  assert.deepEqual(vitals, { weightGrams: 4200, recordedById: staffId });
  assert.equal(
    (await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { currentWeightGrams: true },
    })).currentWeightGrams,
    4200,
  );
  await assertNoListingMismatch(animalId);
});

test("an unknown species or color is refused, and no animal is left behind", async () => {
  const otherColor = await prisma.color.create({
    data: { name: `Creation removed color ${runId}`, deletedAt: new Date() },
    select: { id: true },
  });
  try {
    await assert.rejects(
      create("Bad color", { additionalColors: [otherColor.id] }),
      /no longer available/,
    );
    await assert.rejects(
      create("Bad species", { species: "clnotaspecies0000000000000" }),
      /Invalid Species ID/,
    );
    assert.equal(
      await prisma.animal.count({
        where: { name: { in: [`Bad color ${runId}`, `Bad species ${runId}`] } },
      }),
      0,
    );
  } finally {
    await prisma.color.deleteMany({ where: { id: otherColor.id } });
  }
});

// The picker stops a future day only against the day the page was rendered
// on, so the server checks the day again, against the shelter's today, before
// anything is written.
test("a first intake dated after today is refused with nothing written, and one dated today is created", async () => {
  const today = await getShelterToday();

  const refused = await createAnimalFromForm(
    submission("Tomorrow", { intakeDate: shiftDayKey(today, 1) }),
    staffId,
  );

  assert.deepEqual(refused, {
    refusal: "The intake date can't be in the future.",
  });
  assert.equal(
    await prisma.animal.count({ where: { name: `Tomorrow ${runId}` } }),
    0,
  );

  const created = await createAnimalFromForm(
    submission("Today", { intakeDate: today }),
    staffId,
  );

  assert.ok("animalId" in created);
  const animal = await readAnimal(created.animalId);
  assert.deepEqual(animal.intake, [
    { intakeDate: today, type: IntakeType.SEIZE },
  ]);
  await assertNoListingMismatch(created.animalId);
});
