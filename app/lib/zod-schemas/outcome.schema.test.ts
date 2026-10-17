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

import { CreateOutcomeFormSchema, OutcomeFormSchema } from "./outcome.schema";
import { fieldErrorsByPath } from "../utils/form-result-utils";
test("outcome input keeps correction omission but creation requires clinical facts with dotted errors", () => {
  const input = { outcomeDate: "2026-01-03", outcomeType: "DECEASED" };
  assert.equal(OutcomeFormSchema.safeParse(input).success, true);
  assert.equal(CreateOutcomeFormSchema.safeParse(input).success, false);
  const bad = CreateOutcomeFormSchema.safeParse({ ...input, medical: { kind: "DEATH", circumstances: "OTHER", causeKnowledge: "KNOWN", necropsyRequested: null } });
  assert.equal(bad.success, false);
  if (!bad.success) {
    const errors = fieldErrorsByPath<Record<string, unknown>>(bad.error.issues);
    assert.ok(errors["medical.cause"]);
    assert.ok(errors["medical.circumstanceNotes"]);
  }
});
