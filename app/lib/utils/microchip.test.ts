import { test } from "node:test";
import assert from "node:assert/strict";
import { chipNumberIssue, normaliseChipNumber } from "./microchip";

test("a chip number loses its spaces and hyphens, and reads in upper case", () => {
  assert.equal(normaliseChipNumber("985 141 000 100 003"), "985141000100003");
  assert.equal(normaliseChipNumber("985-141-000-100-003"), "985141000100003");
  assert.equal(normaliseChipNumber(" 0a1b2c3d4e\t"), "0A1B2C3D4E");
  assert.equal(normaliseChipNumber("  "), "");
});

test("a chip number is 9 to 15 letters or digits", () => {
  assert.equal(chipNumberIssue("985141000100003"), null);
  assert.equal(chipNumberIssue("0A1B2C3D4"), null);
  assert.equal(chipNumberIssue(""), "The chip number is required.");
  assert.equal(
    chipNumberIssue("12345678"),
    "A chip number is 9 to 15 letters or digits.",
  );
  assert.equal(
    chipNumberIssue("9851410001000031"),
    "A chip number is 9 to 15 letters or digits.",
  );
  assert.equal(
    chipNumberIssue("985141.00010003"),
    "A chip number has only letters and digits.",
  );
});

test("a number typed with spaces is checked in its stored form", () => {
  // Nineteen characters as typed, fifteen once normalised.
  assert.equal(chipNumberIssue(normaliseChipNumber("985 141 000 100 003")), null);
});
