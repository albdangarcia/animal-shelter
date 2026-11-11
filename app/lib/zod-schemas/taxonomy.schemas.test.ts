import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { BreedFormSchema } from "./taxonomy.schemas";

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
