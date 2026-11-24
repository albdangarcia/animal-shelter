import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ShelterDetailsFormSchema,
  type ShelterDetailsFormInput,
} from "./shelter-details.schemas";

const fieldErrorsOf = (values: ShelterDetailsFormInput) => {
  const result = ShelterDetailsFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors;
};

test("ShelterDetailsFormSchema: the state is a state, DC or an inhabited territory", () => {
  for (const state of ["NY", "WY", "DC", "PR", "GU", "VI", "AS", "MP"]) {
    assert.deepEqual(ShelterDetailsFormSchema.parse({ state }), { state }, state);
  }
});

test("ShelterDetailsFormSchema: no state, or anything else, is refused under State", () => {
  for (const state of ["", "ny", "UM", "CA-ON", "New York"]) {
    assert.deepEqual(
      fieldErrorsOf({ state }),
      { state: ["Select the state the shelter is in."] },
      state,
    );
  }
  assert.deepEqual(fieldErrorsOf({} as ShelterDetailsFormInput), {
    state: ["Select the state the shelter is in."],
  });
});
