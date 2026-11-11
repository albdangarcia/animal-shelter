// Deleting a species, breed or color in Settings → Animal Taxonomy takes it
// out of use: the animal form's pickers leave it out, and adding or editing
// an animal refuses it, for a form opened before the delete. The edit action
// calls the same `assertLiveTaxonomy` as the create below, inside its own
// transaction; it imports the session, so it is driven through the check here.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  IntakeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  findColorOptions,
  findSpeciesOptions,
} from "@/app/lib/data/animals/taxonomy-options";
import {
  assertLiveTaxonomy,
  BREED_UNAVAILABLE,
  COLORS_UNAVAILABLE,
  SPECIES_UNAVAILABLE,
  TaxonomyRefusal,
  type TaxonomyField,
} from "@/app/lib/services/animal-taxonomy";
import { recordAnimalCreation } from "@/app/lib/services/animal-creation";
import { CreateAnimalFormSchema } from "@/app/lib/zod-schemas/animal.schemas";

const runId = Date.now().toString(36);
const deletedAt = new Date();

let speciesId: string;
let deletedSpeciesId: string;
let otherSpeciesId: string;
let breedId: string;
let deletedBreedId: string;
let otherSpeciesBreedId: string;
let colorId: string;
let otherColorId: string;
let deletedColorId: string;
let staffId: string;

const id = (row: { id: string }) => row.id;

before(async () => {
  speciesId = id(await prisma.species.create({ data: { name: `Taxonomy species ${runId}` } }));
  deletedSpeciesId = id(
    await prisma.species.create({ data: { name: `Taxonomy deleted species ${runId}`, deletedAt } }),
  );
  otherSpeciesId = id(await prisma.species.create({ data: { name: `Taxonomy other species ${runId}` } }));
  breedId = id(await prisma.breed.create({ data: { name: `Taxonomy breed ${runId}`, speciesId } }));
  deletedBreedId = id(
    await prisma.breed.create({ data: { name: `Taxonomy deleted breed ${runId}`, speciesId, deletedAt } }),
  );
  otherSpeciesBreedId = id(
    await prisma.breed.create({ data: { name: `Taxonomy other breed ${runId}`, speciesId: otherSpeciesId } }),
  );
  colorId = id(await prisma.color.create({ data: { name: `Taxonomy color ${runId}` } }));
  otherColorId = id(await prisma.color.create({ data: { name: `Taxonomy other color ${runId}` } }));
  deletedColorId = id(
    await prisma.color.create({ data: { name: `Taxonomy deleted color ${runId}`, deletedAt } }),
  );
  staffId = id(await prisma.person.create({ data: { name: `Taxonomy staff ${runId}` } }));
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.animal.deleteMany({ where: { speciesId: { in: [speciesId, otherSpeciesId, deletedSpeciesId] } } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.breed.deleteMany({ where: { id: { in: [breedId, deletedBreedId, otherSpeciesBreedId] } } });
  await prisma.color.deleteMany({ where: { id: { in: [colorId, otherColorId, deletedColorId] } } });
  await prisma.species.deleteMany({ where: { id: { in: [speciesId, deletedSpeciesId, otherSpeciesId] } } });
  await prisma.$disconnect();
});

type Submitted = Parameters<typeof assertLiveTaxonomy>[1];
const check = (changes: Partial<Submitted>) =>
  prisma.$transaction((tx) =>
    assertLiveTaxonomy(tx, {
      speciesId,
      breedId,
      primaryColorId: colorId,
      additionalColorIds: [otherColorId],
      ...changes,
    }),
  );

const refusedUnder = async (
  promise: Promise<unknown>,
  field: TaxonomyField,
  message: string,
) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TaxonomyRefusal, String(error));
    assert.equal(error.field, field);
    assert.equal(error.message, message);
    return true;
  });
};

test("the pickers leave out deleted species, breeds and colors", async () => {
  const species = await findSpeciesOptions(prisma);
  const ours = species.find((s) => s.id === speciesId);
  assert.ok(ours, "a live species is offered");
  assert.deepEqual(
    ours.breeds.map((b) => b.id),
    [breedId],
    "only the species' live breed is offered",
  );
  assert.equal(species.some((s) => s.id === deletedSpeciesId), false);

  const colors = (await findColorOptions(prisma)).map((c) => c.id);
  assert.ok(colors.includes(colorId));
  assert.equal(colors.includes(deletedColorId), false);
});

test("a live species, its breed and live colors pass", async () => {
  await check({});
});

test("a deleted or unknown species is refused under Species", async () => {
  await refusedUnder(check({ speciesId: deletedSpeciesId }), "species", SPECIES_UNAVAILABLE);
  await refusedUnder(
    check({ speciesId: "clnotaspecies0000000000000" }),
    "species",
    SPECIES_UNAVAILABLE,
  );
});

test("a deleted breed, or one of another species, is refused under Breed", async () => {
  await refusedUnder(check({ breedId: deletedBreedId }), "breed", BREED_UNAVAILABLE);
  await refusedUnder(check({ breedId: otherSpeciesBreedId }), "breed", BREED_UNAVAILABLE);
});

test("a deleted color is refused under the field that holds it", async () => {
  await refusedUnder(
    check({ primaryColorId: deletedColorId }),
    "primaryColor",
    COLORS_UNAVAILABLE,
  );
  await refusedUnder(
    check({ additionalColorIds: [otherColorId, deletedColorId] }),
    "additionalColors",
    COLORS_UNAVAILABLE,
  );
});

test("the primary color listed again among the others still passes", async () => {
  await check({ additionalColorIds: [colorId] });
});

test("adding an animal with a deleted breed writes nothing", async () => {
  const name = `Deleted breed animal ${runId}`;
  const values = CreateAnimalFormSchema.parse({
    animalName: name,
    species: speciesId,
    breed: deletedBreedId,
    primaryColor: colorId,
    additionalColors: [],
    sex: Sex.FEMALE,
    estimatedBirthDate: "2024-01-01",
    listingStatus: AnimalListingStatus.DRAFT,
    heightCm: null,
    weightGrams: null,
    intakeType: IntakeType.SEIZE,
    intakeDate: "2026-01-01",
  });
  await refusedUnder(
    prisma.$transaction((tx) => recordAnimalCreation(tx, values, staffId)),
    "breed",
    BREED_UNAVAILABLE,
  );
  assert.equal(await prisma.animal.count({ where: { name } }), 0);
});
