// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. `recordAnimalUpdate` is the whole of the
// Edit Animal Details save bar the session check, the form validation and
// the cache invalidation, so driving it is driving the action.
//
// These cases are about an animal's breeds: the form names one as Breed and
// the rest as Additional Breeds, and the save keeps every one it names. A
// save once wrote Breed alone, so an ordinary edit of a mixed animal dropped
// its second breed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  IntakeType,
  Sex,
} from "@/prisma/generated/enums";
import { recordAnimalCreation } from "@/app/lib/services/animal-creation";
import { recordAnimalUpdate } from "@/app/lib/services/animal-update";
import {
  BREEDS_UNAVAILABLE,
  TaxonomyRefusal,
} from "@/app/lib/services/animal-taxonomy";
import {
  AnimalEditFormSchema,
  CreateAnimalFormSchema,
} from "@/app/lib/zod-schemas/animal.schemas";

const runId = Date.now().toString(36);

let speciesId: string;
let otherSpeciesId: string;
let labradorId: string;
let mixedId: string;
let poodleId: string;
let deletedBreedId: string;
let otherSpeciesBreedId: string;
let colorId: string;
let staffId: string;

const id = (row: { id: string }) => row.id;

before(async () => {
  speciesId = id(await prisma.species.create({ data: { name: `Update species ${runId}` } }));
  otherSpeciesId = id(
    await prisma.species.create({ data: { name: `Update other species ${runId}` } }),
  );
  const breed = (name: string, data: { speciesId: string; deletedAt?: Date }) =>
    prisma.breed.create({ data: { name: `${name} ${runId}`, ...data } }).then(id);
  labradorId = await breed("Update Labrador", { speciesId });
  mixedId = await breed("Update Mixed", { speciesId });
  poodleId = await breed("Update Poodle", { speciesId });
  deletedBreedId = await breed("Update deleted", { speciesId, deletedAt: new Date() });
  otherSpeciesBreedId = await breed("Update other", { speciesId: otherSpeciesId });
  colorId = id(await prisma.color.create({ data: { name: `Update color ${runId}` } }));
  staffId = id(await prisma.person.create({ data: { name: `Update staff ${runId}` } }));
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({
    where: { speciesId: { in: [speciesId, otherSpeciesId] } },
  });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.breed.deleteMany({
    where: {
      id: { in: [labradorId, mixedId, poodleId, deletedBreedId, otherSpeciesBreedId] },
    },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [speciesId, otherSpeciesId] } } });
  await prisma.$disconnect();
});

const animalFields = (label: string) => ({
  animalName: `${label} ${runId}`,
  species: speciesId,
  breed: labradorId,
  additionalBreeds: [mixedId],
  primaryColor: colorId,
  additionalColors: [],
  sex: Sex.MALE,
  estimatedBirthDate: "2024-01-01",
  listingStatus: AnimalListingStatus.DRAFT,
  heightCm: null,
});

/** A Labrador mix, added the way the intake form adds one. */
const addMixedAnimal = async (label: string) => {
  const { animalId } = await prisma.$transaction((tx) =>
    recordAnimalCreation(
      tx,
      CreateAnimalFormSchema.parse({
        ...animalFields(label),
        weightGrams: null,
        intakeType: IntakeType.SEIZE,
        intakeDate: "2026-01-01",
        applyProtocol: false,
      }),
      staffId,
    ),
  );
  return animalId;
};

/** What the edit form submits, parsed the way the action parses it. */
const save = (
  animalId: string,
  label: string,
  changes: Record<string, unknown> = {},
) =>
  prisma.$transaction((tx) =>
    recordAnimalUpdate(tx, {
      animalId,
      values: AnimalEditFormSchema.parse({ ...animalFields(label), ...changes }),
      staffMemberId: staffId,
      offersCare: false,
    }),
  );

const breedsOf = async (animalId: string) =>
  (
    await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { breeds: { select: { id: true } } },
    })
  ).breeds
    .map((b) => b.id)
    .sort();

const sorted = (...ids: string[]) => [...ids].sort();

test("an intake with additional breeds gives the animal every one", async () => {
  const animalId = await addMixedAnimal("Intake mix");
  assert.deepEqual(await breedsOf(animalId), sorted(labradorId, mixedId));
});

test("saving a mixed animal unchanged keeps both its breeds", async () => {
  const label = "Unchanged mix";
  const animalId = await addMixedAnimal(label);
  await save(animalId, label, { description: "Loves the ball pit." });
  assert.deepEqual(await breedsOf(animalId), sorted(labradorId, mixedId));
});

test("a save adds and removes additional breeds", async () => {
  const label = "Changing mix";
  const animalId = await addMixedAnimal(label);

  await save(animalId, label, { additionalBreeds: [mixedId, poodleId] });
  assert.deepEqual(await breedsOf(animalId), sorted(labradorId, mixedId, poodleId));

  await save(animalId, label, { additionalBreeds: [] });
  assert.deepEqual(await breedsOf(animalId), [labradorId]);
});

test("changing Breed keeps the additional breeds", async () => {
  const label = "New breed mix";
  const animalId = await addMixedAnimal(label);
  await save(animalId, label, { breed: poodleId });
  assert.deepEqual(await breedsOf(animalId), sorted(poodleId, mixedId));
});

test("an additional breed deleted or of another species is refused and nothing is saved", async () => {
  const label = "Refused mix";
  const animalId = await addMixedAnimal(label);
  for (const breedId of [deletedBreedId, otherSpeciesBreedId]) {
    await assert.rejects(
      save(animalId, label, {
        additionalBreeds: [mixedId, breedId],
        description: "Should not be saved.",
      }),
      (error: unknown) => {
        assert.ok(error instanceof TaxonomyRefusal, String(error));
        assert.equal(error.field, "additionalBreeds");
        assert.equal(error.message, BREEDS_UNAVAILABLE);
        return true;
      },
    );
  }
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: { description: true },
  });
  assert.notEqual(animal.description, "Should not be saved.");
  assert.deepEqual(await breedsOf(animalId), sorted(labradorId, mixedId));
});
