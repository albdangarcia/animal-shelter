import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, normalizePhoneQuery } from "./phone";

test("equivalent US formats normalize to the same E.164 value", () => {
  const expected = "+15551234567";

  assert.equal(normalizePhone("(555) 123-4567"), expected);
  assert.equal(normalizePhone("555-123-4567"), expected);
  assert.equal(normalizePhone("5551234567"), expected);
});

test("international numbers override the default country", () => {
  assert.equal(normalizePhone("+44 20 7946 0958", "US"), "+442079460958");
});

test("empty, missing, and unparseable input returns null", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone("asdf"), null);
});

test("possible numbers normalize even when they are not valid", () => {
  assert.equal(normalizePhone("555-123-4567"), "+15551234567");
});

test("extensions are dropped from the E.164 value", () => {
  assert.equal(normalizePhone("212-555-0199 x12"), "+12125550199");
});

test("normalization is idempotent", () => {
  const normalized = normalizePhone("(212) 555-0199");

  assert.equal(normalizePhone(normalized), normalized);
});

test("phone search queries retain only digits", () => {
  assert.equal(normalizePhoneQuery("(555) 123"), "555123");
  assert.equal(normalizePhoneQuery("asdf"), "");
});
