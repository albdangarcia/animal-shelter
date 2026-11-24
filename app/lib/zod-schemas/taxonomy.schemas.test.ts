import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { SacSpeciesCategory } from "@/prisma/generated/enums";
import { BreedFormSchema, SpeciesFormSchema } from "./taxonomy.schemas";

const SPECIES = "ckq1a2b3c4d5e6f7g8h9i0j2k";

const speciesErrors = (speciesId: unknown) => {
  const result = BreedFormSchema.safeParse({ name: "Beagle", speciesId });
  return result.success
    ? []
    : (z.flattenError(result.error).fieldErrors.speciesId ?? []);
};

test("a breed with no species picked asks for one, in staff words", () => {
  // The Add Breed form sends "" until a species is picked.
  assert.deepEqual(speciesErrors(""), ["Pick a species."]);
  assert.deepEqual(speciesErrors(undefined), ["Pick a species."]);
});

test("a breed with a species id that isn't one is refused, not asked to pick", () => {
  for (const speciesId of ["not-a-cuid", "   ", 42]) {
    const errors = speciesErrors(speciesId);
    assert.ok(errors.length > 0, String(speciesId));
    assert.ok(!errors.includes("Pick a species."), String(speciesId));
  }
});

test("a breed with a species id saves", () => {
  assert.deepEqual(speciesErrors(SPECIES), []);
});

const sacCategoryOf = (sacCategory: unknown) =>
  SpeciesFormSchema.safeParse({ name: "Ferret", sacCategory });

test("a species saves with any Shelter Animals Count category", () => {
  for (const category of Object.values(SacSpeciesCategory)) {
    const result = sacCategoryOf(category);
    assert.ok(result.success, category);
    assert.equal(result.data.sacCategory, category);
  }
});

test("a species with no Shelter Animals Count category is accepted", () => {
  // The form sends "" for "Not reported"; a caller that only renames sends
  // nothing, and the action keeps the saved category.
  for (const sacCategory of ["", undefined]) {
    const result = sacCategoryOf(sacCategory);
    assert.ok(result.success, String(sacCategory));
    assert.ok(!result.data.sacCategory, String(sacCategory));
  }
});

test("a species with a category Shelter Animals Count doesn't have is refused", () => {
  for (const sacCategory of ["DOG", "canine", "OTHER", null, 3]) {
    const result = sacCategoryOf(sacCategory);
    assert.ok(!result.success, String(sacCategory));
    assert.ok(
      (z.flattenError(result.error).fieldErrors.sacCategory ?? []).length > 0,
      String(sacCategory),
    );
  }
});
