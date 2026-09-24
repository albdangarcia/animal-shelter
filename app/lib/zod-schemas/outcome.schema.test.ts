import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ReverseOutcomeSchema } from "./outcome.schema";

test("ReverseOutcomeSchema: a blank or whitespace reason is refused on the reason field", () => {
  for (const reason of ["", "   \n"]) {
    const result = ReverseOutcomeSchema.safeParse({ reason });
    assert.equal(result.success, false);
    if (result.success) return;
    // The action hands these to the form as they are, so the message has to
    // be keyed to the field for the form to show it.
    assert.ok(z.flattenError(result.error).fieldErrors.reason?.length);
  }
});

test("ReverseOutcomeSchema: the reason is kept trimmed", () => {
  const result = ReverseOutcomeSchema.safeParse({
    reason: "  Entered against the wrong animal.  ",
  });
  assert.deepEqual(result, {
    success: true,
    data: { reason: "Entered against the wrong animal." },
  });
});

test("ReverseOutcomeSchema: a reason over 1000 characters is refused", () => {
  assert.equal(
    ReverseOutcomeSchema.safeParse({ reason: "x".repeat(1001) }).success,
    false,
  );
  assert.equal(
    ReverseOutcomeSchema.safeParse({ reason: "x".repeat(1000) }).success,
    true,
  );
});
