import { test } from "node:test";
import assert from "node:assert/strict";
import { fosterSpeciesOptions } from "./foster-species-options";

const dog = { id: "dog", name: "Dog" };
const cat = { id: "cat", name: "Cat" };
const rabbit = { id: "rabbit", name: "Rabbit" };

test("a foster's deleted species is still offered, after the live ones, so it can be unticked", () => {
  assert.deepEqual(fosterSpeciesOptions([cat, dog], [dog, rabbit]), [cat, dog, rabbit]);
});

test("a species the foster lists that is live is offered once", () => {
  assert.deepEqual(fosterSpeciesOptions([cat, dog], [cat, dog]), [cat, dog]);
});

test("a deleted species the foster doesn't list isn't offered", () => {
  assert.deepEqual(fosterSpeciesOptions([cat], []), [cat]);
});
