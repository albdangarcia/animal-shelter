import { test } from "node:test";
import assert from "node:assert/strict";
import { lowercaseEmail } from "./email-normalization";

test("flat email is lowercased in place", () => {
  const data: Record<string, unknown> = { name: "Jane", email: "Jane@Example.com" };
  lowercaseEmail(data);
  assert.equal(data.email, "jane@example.com");
});

test("the { set: ... } update-operations wrapper is unwrapped and lowercased", () => {
  const data: Record<string, unknown> = { email: { set: "Jane@Example.COM" } };
  lowercaseEmail(data);
  assert.deepEqual(data.email, { set: "jane@example.com" });
});

test("createMany's array form lowercases every row", () => {
  const rows: Record<string, unknown>[] = [
    { email: "Jane@Example.com" },
    { email: "SAM@example.com" },
    { name: "No email here" },
  ];
  lowercaseEmail(rows);
  assert.equal(rows[0].email, "jane@example.com");
  assert.equal(rows[1].email, "sam@example.com");
  assert.equal("email" in rows[2], false);
});

test("upsert's separate create and update blocks are each lowercased", () => {
  const args: { create: Record<string, unknown>; update: Record<string, unknown> } = {
    create: { email: "Jane@Example.com" },
    update: { email: { set: "SAM@Example.com" } },
  };
  lowercaseEmail(args.create);
  lowercaseEmail(args.update);
  assert.equal(args.create.email, "jane@example.com");
  assert.deepEqual(args.update.email, { set: "sam@example.com" });
});

test("email absent leaves the payload untouched", () => {
  const data: Record<string, unknown> = { name: "Jane" };
  lowercaseEmail(data);
  assert.deepEqual(data, { name: "Jane" });
});

test("email: null is preserved", () => {
  const data: Record<string, unknown> = { email: null };
  lowercaseEmail(data);
  assert.equal(data.email, null);
});

test("the { set: null } wrapper is preserved", () => {
  const data: Record<string, unknown> = { email: { set: null } };
  lowercaseEmail(data);
  assert.deepEqual(data.email, { set: null });
});

// `email: undefined` is how a caller spreads an optional field. Prisma treats
// it as absent, so it must stay undefined rather than becoming the string
// "undefined" or throwing.
test("email: undefined is left alone", () => {
  const data: Record<string, unknown> = { email: undefined };
  lowercaseEmail(data);
  assert.equal(data.email, undefined);
});

test("an already-lowercase email is unchanged", () => {
  const data: Record<string, unknown> = { email: "jane@example.com" };
  lowercaseEmail(data);
  assert.equal(data.email, "jane@example.com");
});

// Only case is normalized. Whitespace is the form schema's job; stripping it
// here would silently rewrite what a caller believes it stored.
test("surrounding whitespace is not trimmed", () => {
  const data: Record<string, unknown> = { email: " Jane@Example.com " };
  lowercaseEmail(data);
  assert.equal(data.email, " jane@example.com ");
});

// Documents the early return, so the guard is not removed as dead code.
test("non-object payloads are ignored rather than throwing", () => {
  assert.doesNotThrow(() => lowercaseEmail(undefined));
  assert.doesNotThrow(() => lowercaseEmail(null));
  assert.doesNotThrow(() => lowercaseEmail("not a payload"));
});
