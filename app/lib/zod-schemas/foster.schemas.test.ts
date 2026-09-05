import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CreateFosterPlacementSchema } from "./foster.schemas";

const dayOffset = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
};

const baseInput = {
  animalId: "cmtn2bxpz00gancgsd6hyf79q",
  fosterProfileId: "cmtn2bxpz00gancgsd6hyf79r",
  type: "GENERAL" as const,
};

test("CreateFosterPlacementSchema: omitting the expected return date is valid", () => {
  // The open-ended placement — the common case, and the one that motivated
  // keeping this field optional.
  const result = CreateFosterPlacementSchema.safeParse(baseInput);
  assert.equal(result.success, true);
});

test("CreateFosterPlacementSchema: a future expected return date is valid", () => {
  const result = CreateFosterPlacementSchema.safeParse({
    ...baseInput,
    expectedEndDate: dayOffset(9),
  });
  assert.equal(result.success, true);
});

test("CreateFosterPlacementSchema: a today expected return date is valid", () => {
  const result = CreateFosterPlacementSchema.safeParse({
    ...baseInput,
    expectedEndDate: dayOffset(0),
  });
  assert.equal(result.success, true);
});

test("CreateFosterPlacementSchema: a past expected return date is rejected", () => {
  // The bug this fixes: the calendar greys out past days client-side, but
  // nothing stopped a past date reaching createFosterPlacement, producing a
  // placement that lands in the overdue attention queue the moment it exists.
  const result = CreateFosterPlacementSchema.safeParse({
    ...baseInput,
    expectedEndDate: dayOffset(-1),
  });
  assert.equal(result.success, false);
});

test("CreateFosterPlacementSchema: the past-date error is on the expectedEndDate path", () => {
  // createFosterPlacement surfaces errors via z.flattenError(...).fieldErrors,
  // so the message has to be keyed to the field for the form to show it.
  const result = CreateFosterPlacementSchema.safeParse({
    ...baseInput,
    expectedEndDate: dayOffset(-3),
  });
  assert.equal(result.success, false);
  if (result.success) return;

  const { fieldErrors } = z.flattenError(result.error);
  assert.deepEqual(fieldErrors.expectedEndDate, [
    "An expected return date cannot be in the past.",
  ]);
});
