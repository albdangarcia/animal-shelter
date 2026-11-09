import { test } from "node:test";
import assert from "node:assert/strict";
import { attachCause } from "./errors";

test("attachCause: sets a cause on an error that has none", () => {
  const error = new Error("insert failed");
  const cause = new Error("rollback failed");
  attachCause(error, cause);
  assert.equal(error.cause, cause);
});

test("attachCause: keeps a cause already there, and leaves anything but an Error alone", () => {
  const first = new Error("connection lost");
  const error = new Error("insert failed", { cause: first });
  attachCause(error, new Error("rollback failed"));
  assert.equal(error.cause, first);

  const thrown = { message: "not an Error" };
  attachCause(thrown, new Error("rollback failed"));
  assert.deepEqual(thrown, { message: "not an Error" });
});

test("attachCause: an error that can't take the property is left as it was, and nothing throws", () => {
  const frozen = Object.freeze(new Error("insert failed"));
  assert.doesNotThrow(() => attachCause(frozen, new Error("rollback failed")));
  assert.equal(frozen.cause, undefined);

  const sealed = Object.preventExtensions(new Error("insert failed"));
  assert.doesNotThrow(() => attachCause(sealed, new Error("rollback failed")));
  assert.equal(sealed.cause, undefined);
});
