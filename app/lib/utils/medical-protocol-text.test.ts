import { test } from "node:test";
import assert from "node:assert/strict";
import { coveredAgesText, speciesPlural } from "./medical-protocol-text";

test("speciesPlural: lower case, with an s unless it has one", () => {
  assert.equal(speciesPlural("Dog"), "dogs");
  assert.equal(speciesPlural("Guinea Pig"), "guinea pigs");
  assert.equal(speciesPlural("Hamsters"), "hamsters");
});

test("coveredAgesText: the last age covered is the day before the maximum", () => {
  assert.equal(coveredAgesText(null, 140), "from birth to 139 days");
  assert.equal(coveredAgesText(0, 140), "from birth to 139 days");
  assert.equal(coveredAgesText(56, 140), "from 56 to 139 days");
});

test("coveredAgesText: open ends", () => {
  assert.equal(coveredAgesText(140, null), "from 140 days");
  assert.equal(coveredAgesText(1, null), "from 1 day");
  assert.equal(coveredAgesText(null, null), "at every age");
  assert.equal(coveredAgesText(0, null), "at every age");
});

test("coveredAgesText: a range of one age", () => {
  assert.equal(coveredAgesText(null, 1), "aged 0 days");
  assert.equal(coveredAgesText(1, 2), "aged 1 day");
  assert.equal(coveredAgesText(null, 2), "from birth to 1 day");
});
