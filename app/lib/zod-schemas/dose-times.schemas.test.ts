import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { DoseTimesFormSchema, type DoseTimesFormInput } from "./dose-times.schemas";

const fieldErrorsOf = (values: DoseTimesFormInput) => {
  const result = DoseTimesFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors;
};

test("DoseTimesFormSchema: three times of day, in order", () => {
  assert.deepEqual(
    DoseTimesFormSchema.parse({ AM: " 09:30 ", MIDDAY: "13:00", PM: "21:00" }),
    { AM: "09:30", MIDDAY: "13:00", PM: "21:00" },
  );
  // Each bad field carries its own message.
  assert.deepEqual(fieldErrorsOf({ AM: "", MIDDAY: "25:00", PM: "20:00" }), {
    AM: ["Enter a time of day, such as 10:00."],
    MIDDAY: ["Enter a time of day, such as 10:00."],
  });
  assert.deepEqual(fieldErrorsOf({ AM: "10:00", MIDDAY: "09:00", PM: "20:00" }), {
    MIDDAY: ["Midday doses must end after AM doses."],
  });
  assert.deepEqual(fieldErrorsOf({ AM: "10:00", MIDDAY: "14:00", PM: "14:00" }), {
    PM: ["PM doses must end after Midday doses."],
  });
});
