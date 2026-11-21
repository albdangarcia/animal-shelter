import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { StaffAdoptionApplicationFormSchema } from "./application.schemas";

// The staff form holds "" until an animal is picked (and undefined once the
// form is reset). The message has to say what to do; a malformed id that is
// not empty keeps the schema's own message, reachable only by a direct call.
const MALFORMED = "Invalid ID format. Expected a CUID.";

const animalIdErrors = (animalId: unknown) => {
  const result = StaffAdoptionApplicationFormSchema.safeParse({ animalId });
  assert.equal(result.success, false);
  return (
    z.flattenError(result.error!).fieldErrors as Record<string, string[]>
  ).animalId;
};

test("StaffAdoptionApplicationFormSchema: an unpicked animal says to pick one", () => {
  for (const unpicked of ["", undefined]) {
    assert.deepEqual(animalIdErrors(unpicked), ["Pick an animal."]);
  }
});

test("StaffAdoptionApplicationFormSchema: a malformed animal id keeps the schema's message", () => {
  assert.deepEqual(animalIdErrors("not an id"), [MALFORMED]);
  assert.deepEqual(animalIdErrors("NOT-A-CUID"), [MALFORMED]);
});
