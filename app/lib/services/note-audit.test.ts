// Pure-predicate tests for no-op edit guard. No database: this runs
// under `npm test` (`tsx --test "app/**/*.test.ts"`, no dotenv prefix), so it
// must not import anything that opens a connection. `note-audit.ts` only pulls
// in the generated enums plus a type-only `TransactionClient`, both erased or
// inert at runtime, so importing it here is safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isNoteEditNoOp, NO_OP_EDIT_MESSAGE } from "./note-audit";

test("identical content and category is a no-op (animal note)", () => {
  assert.equal(
    isNoteEditNoOp(
      { content: "same", category: "MEDICAL" },
      { content: "same", category: "MEDICAL" },
    ),
    true,
  );
});

test("a changed content is not a no-op", () => {
  assert.equal(
    isNoteEditNoOp(
      { content: "before", category: "MEDICAL" },
      { content: "after", category: "MEDICAL" },
    ),
    false,
  );
});

test("a changed category alone is not a no-op", () => {
  assert.equal(
    isNoteEditNoOp(
      { content: "same", category: "MEDICAL" },
      { content: "same", category: "BEHAVIORAL" },
    ),
    false,
  );
});

test("person/partner notes: content-only comparison, no category on either side", () => {
  assert.equal(
    isNoteEditNoOp({ content: "same" }, { content: "same" }),
    true,
  );
  assert.equal(
    isNoteEditNoOp({ content: "before" }, { content: "after" }),
    false,
  );
});

test("an absent category and an explicit null category compare equal", () => {
  assert.equal(
    isNoteEditNoOp({ content: "same" }, { content: "same", category: null }),
    true,
  );
  assert.equal(
    isNoteEditNoOp({ content: "same", category: null }, { content: "same" }),
    true,
  );
});

test("whitespace differences in content are still a real edit", () => {
  assert.equal(
    isNoteEditNoOp({ content: "text" }, { content: "text " }),
    false,
  );
});

test("the no-op message is the exact string the dialog toasts and the e2e keys off", () => {
  assert.equal(NO_OP_EDIT_MESSAGE, "No changes to save.");
});
