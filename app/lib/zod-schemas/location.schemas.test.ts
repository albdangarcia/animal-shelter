import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LocationFormSchema } from "./location.schemas";

const typeErrors = (type: unknown) => {
  const result = LocationFormSchema.safeParse({ name: "Main kennels", type });
  return result.success
    ? []
    : (z.flattenError(result.error).fieldErrors.type ?? []);
};

test("a location with no type picked asks for one, in staff words", () => {
  // The Add Location form sends "" until a type is picked.
  assert.deepEqual(typeErrors(""), ["Pick a location type."]);
  assert.deepEqual(typeErrors(undefined), ["Pick a location type."]);
});

test("a location type that isn't one is refused, not asked to pick", () => {
  for (const type of ["BOGUS", "kennel", null]) {
    const errors = typeErrors(type);
    assert.ok(errors.length > 0, String(type));
    assert.ok(!errors.includes("Pick a location type."), String(type));
  }
});

test("a location with a type saves", () => {
  assert.deepEqual(typeErrors("KENNEL"), []);
});
