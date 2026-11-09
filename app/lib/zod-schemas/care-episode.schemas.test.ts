import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  CareEpisodeFormSchema,
  CloseCareEpisodeSchema,
  VoidCareEpisodeSchema,
  type CareEpisodeFormInput,
} from "./care-episode.schemas";

const episode: CareEpisodeFormInput = {
  type: "HOSPITALISED_IN_HOUSE",
  startDate: "2026-10-03",
  endDate: "",
  reason: "Heartworm treatment.",
  partnerId: "",
  notes: "",
};

const fieldErrorsOf = (values: CareEpisodeFormInput) => {
  const result = CareEpisodeFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
};

test("CareEpisodeFormSchema: text is trimmed, and blanks read as none", () => {
  assert.deepEqual(
    CareEpisodeFormSchema.parse({ ...episode, reason: "  Heartworm treatment. ", notes: " " }),
    {
      type: "HOSPITALISED_IN_HOUSE",
      startDate: "2026-10-03",
      endDate: null,
      reason: "Heartworm treatment.",
      partnerId: null,
      notes: null,
    },
  );
});

test("CareEpisodeFormSchema: the kind, start day and reason are required", () => {
  const errors = fieldErrorsOf({
    ...episode,
    type: "" as CareEpisodeFormInput["type"],
    startDate: "",
    reason: "  ",
  });
  assert.deepEqual(errors.type, ["Pick the kind of care."]);
  assert.deepEqual(errors.startDate, ["The start date is required."]);
  assert.deepEqual(errors.reason, ["Say why the animal is under care."]);
});

test("CareEpisodeFormSchema: a clinic off site, none in house, either under vet care", () => {
  assert.deepEqual(
    fieldErrorsOf({ ...episode, type: "HOSPITALISED_OFF_SITE" }).partnerId,
    ["Pick the clinic the animal is hospitalised at."],
  );
  assert.deepEqual(
    fieldErrorsOf({ ...episode, partnerId: "cmclinic0000000000000000" }).partnerId,
    ["A stay in house has no clinic."],
  );
  for (const partnerId of ["", "cmclinic0000000000000000"]) {
    assert.equal(
      CareEpisodeFormSchema.safeParse({ ...episode, type: "UNDER_VET_CARE", partnerId })
        .success,
      true,
    );
  }
});

test("CareEpisodeFormSchema: an end day is on or after the start", () => {
  assert.deepEqual(fieldErrorsOf({ ...episode, endDate: "2026-10-02" }).endDate, [
    "The end date can't be before the start date.",
  ]);
  assert.equal(
    CareEpisodeFormSchema.safeParse({ ...episode, endDate: "2026-10-03" }).success,
    true,
  );
});

test("CloseCareEpisodeSchema and VoidCareEpisodeSchema: the day and the reason are required", () => {
  assert.equal(CloseCareEpisodeSchema.safeParse({ endDate: "" }).success, false);
  assert.deepEqual(CloseCareEpisodeSchema.parse({ endDate: "2026-10-09" }), {
    endDate: "2026-10-09",
  });
  assert.equal(VoidCareEpisodeSchema.safeParse({ reason: " " }).success, false);
});
