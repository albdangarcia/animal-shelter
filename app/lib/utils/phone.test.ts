import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, normalizePhoneQuery } from "./phone";

test("equivalent US formats normalize to the same E.164 value", () => {
  const expected = "+15551234567";

  assert.equal(normalizePhone("(555) 123-4567", "US"), expected);
  assert.equal(normalizePhone("555-123-4567", "US"), expected);
  assert.equal(normalizePhone("5551234567", "US"), expected);
});

test("international numbers override the default country", () => {
  assert.equal(normalizePhone("+44 20 7946 0958", "US"), "+442079460958");
});

test("empty, missing, and unparseable input returns null", () => {
  assert.equal(normalizePhone("", "US"), null);
  assert.equal(normalizePhone(null, "US"), null);
  assert.equal(normalizePhone(undefined, "US"), null);
  assert.equal(normalizePhone("asdf", "US"), null);
});

test("possible numbers normalize even when they are not valid", () => {
  assert.equal(normalizePhone("555-123-4567", "US"), "+15551234567");
});

test("extensions are dropped from the E.164 value", () => {
  assert.equal(normalizePhone("212-555-0199 x12", "US"), "+12125550199");
});

test("normalization is idempotent", () => {
  const normalized = normalizePhone("(212) 555-0199", "US");

  assert.equal(normalizePhone(normalized, "US"), normalized);
});

test("phone search queries retain only digits", () => {
  assert.equal(normalizePhoneQuery("(555) 123"), "555123");
  assert.equal(normalizePhoneQuery("asdf"), "");
});
