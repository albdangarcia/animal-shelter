import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePhoneNormalized } from "./phone-normalization";

test("flat phone is normalized in place", () => {
  const data: Record<string, unknown> = { name: "Jane", phone: "(555) 123-4567" };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, "+15551234567");
});

test("the { set: ... } update-operations wrapper is unwrapped", () => {
  const data: Record<string, unknown> = { phone: { set: "(212) 555-0199" } };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, "+12125550199");
});

test("createMany's array form derives every row", () => {
  const rows: Record<string, unknown>[] = [
    { phone: "(555) 123-4567" },
    { phone: "212-555-0199" },
    { name: "No phone here" },
  ];
  derivePhoneNormalized(rows);
  assert.equal(rows[0].phoneNormalized, "+15551234567");
  assert.equal(rows[1].phoneNormalized, "+12125550199");
  assert.equal("phoneNormalized" in rows[2], false);
});

test("upsert's separate create and update blocks are each derived", () => {
  const args: { create: Record<string, unknown>; update: Record<string, unknown> } = {
    create: { phone: "555-123-4567" },
    update: { phone: { set: "212-555-0199" } },
  };
  derivePhoneNormalized(args.create);
  derivePhoneNormalized(args.update);
  assert.equal(args.create.phoneNormalized, "+15551234567");
  assert.equal(args.update.phoneNormalized, "+12125550199");
});

test("phone absent leaves phoneNormalized untouched", () => {
  const data: Record<string, unknown> = { name: "Jane", phoneNormalized: "+15551234567" };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, "+15551234567");
});

test("phone: null clears the derived column", () => {
  const data: Record<string, unknown> = { phone: null, phoneNormalized: "+15551234567" };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, null);
});

test("unparseable phone derives to null", () => {
  const data: Record<string, unknown> = { phone: "call the front desk" };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, null);
});

// deleting the five inline call sites is only safe if a
// hand-written phoneNormalized cannot survive a write that carries a phone.
test("an explicit phoneNormalized is overridden when phone is present", () => {
  const data: Record<string, unknown> = {
    phone: "(555) 123-4567",
    phoneNormalized: "stale",
  };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, "+15551234567");
});

// Clearing a nullable field through the operations form, rather than flat.
test("the { set: null } wrapper clears the derived column", () => {
  const data: Record<string, unknown> = {
    phone: { set: null },
    phoneNormalized: "+15551234567",
  };
  derivePhoneNormalized(data);
  assert.equal(data.phoneNormalized, null);
});

// Documents the early return, so the guard is not removed as dead code.
test("non-object payloads are ignored rather than throwing", () => {
  assert.doesNotThrow(() => derivePhoneNormalized(undefined));
  assert.doesNotThrow(() => derivePhoneNormalized(null));
  assert.doesNotThrow(() => derivePhoneNormalized("not a payload"));
});