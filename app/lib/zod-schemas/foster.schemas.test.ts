import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  CreateFosterProfileSchema,
  createFosterPlacementSchema,
  ReturnFromFosterSchema,
} from "./foster.schemas";
import { FosterReturnReason } from "@/prisma/generated/enums";
import { calendarDay, shiftDayKey } from "@/app/lib/utils/shelter-day";

// A fixed day the schema is built from, so these cases do not depend on when
// or where the suite runs — which is why the schema takes today as an argument.
const TODAY = calendarDay("2026-09-21");
const schema = createFosterPlacementSchema(TODAY);
const day = (offset: number) => shiftDayKey(TODAY, offset);

const baseInput = {
  animalId: "cmtn2bxpz00gancgsd6hyf79q",
  fosterProfileId: "cmtn2bxpz00gancgsd6hyf79r",
  type: "GENERAL" as const,
};

test("createFosterPlacementSchema: omitting the expected return date is valid", () => {
  // The open-ended placement — the common case, and the one that motivated
  // keeping this field optional.
  const result = schema.safeParse(baseInput);
  assert.equal(result.success, true);
});

test("createFosterPlacementSchema: a cleared expected return date is valid", () => {
  // The picker writes null when its day is cleared.
  const result = schema.safeParse({ ...baseInput, expectedEndDate: null });
  assert.equal(result.success, true);
  assert.equal(result.data?.expectedEndDate, null);
});

test("createFosterPlacementSchema: a future expected return day is valid", () => {
  const result = schema.safeParse({
    ...baseInput,
    expectedEndDate: day(9),
  });
  assert.equal(result.success, true);
});

test("createFosterPlacementSchema: a today expected return day is valid", () => {
  const result = schema.safeParse({ ...baseInput, expectedEndDate: TODAY });
  assert.equal(result.success, true);
});

test("createFosterPlacementSchema: a past expected return day is rejected", () => {
  // The bug this fixes: the calendar greys out past days client-side, but
  // nothing stopped a past day reaching createFosterPlacement, producing a
  // placement that lands in the overdue attention queue the moment it exists.
  const result = schema.safeParse({
    ...baseInput,
    expectedEndDate: day(-1),
  });
  assert.equal(result.success, false);
});

test("createFosterPlacementSchema: the past-day error is on the expectedEndDate path", () => {
  // createFosterPlacement surfaces errors via z.flattenError(...).fieldErrors,
  // so the message has to be keyed to the field for the form to show it.
  const result = schema.safeParse({
    ...baseInput,
    expectedEndDate: day(-3),
  });
  assert.equal(result.success, false);
  if (result.success) return;

  const { fieldErrors } = z.flattenError(result.error);
  assert.deepEqual(fieldErrors.expectedEndDate, [
    "An expected return date cannot be in the past.",
  ]);
});

test("createFosterPlacementSchema: a malformed expected return date is rejected", () => {
  // The picker can only produce `yyyy-MM-dd`, but the action is a public
  // entry point and the column's invariant has to hold whatever reaches it.
  const result = schema.safeParse({
    ...baseInput,
    expectedEndDate: "2026-9-1",
  });
  assert.equal(result.success, false);
});

test("createFosterPlacementSchema: the boundary moves with the day it is built from", () => {
  // The whole reason today is a parameter: the same submitted day is valid or
  // not depending on which day the shelter is having.
  const submitted = "2026-09-21";
  assert.equal(
    createFosterPlacementSchema(calendarDay("2026-09-21")).safeParse({
      ...baseInput,
      expectedEndDate: submitted,
    }).success,
    true,
  );
  assert.equal(
    createFosterPlacementSchema(calendarDay("2026-09-22")).safeParse({
      ...baseInput,
      expectedEndDate: submitted,
    }).success,
    false,
  );
});

const returnInput = {
  placementId: "cmtn2bxpz00gancgsd6hyf79q",
  unitId: "cmtn2bxpz00gancgsd6hyf79s",
};

test("ReturnFromFosterSchema: the reasons a return can give are accepted", () => {
  for (const returnReason of [
    FosterReturnReason.RETURNED_TO_SHELTER,
    FosterReturnReason.TRANSFERRED,
    FosterReturnReason.MEDICAL,
    FosterReturnReason.OTHER,
  ]) {
    const result = ReturnFromFosterSchema.safeParse({
      ...returnInput,
      returnReason,
    });
    assert.equal(result.success, true, returnReason);
  }
});

test("ReturnFromFosterSchema: the reasons only an outcome records are refused", () => {
  // The form hides them, so this is a direct call: a return with either
  // would say an outcome ended the placement while putting the animal back
  // in a unit.
  for (const returnReason of [
    FosterReturnReason.ADOPTED_BY_FOSTER,
    FosterReturnReason.ENDED_BY_OUTCOME,
  ]) {
    const result = ReturnFromFosterSchema.safeParse({
      ...returnInput,
      returnReason,
    });
    assert.equal(result.success, false, returnReason);
    assert.deepEqual(z.flattenError(result.error!).fieldErrors, {
      returnReason: ["That reason is recorded by an outcome, not by a return."],
    });
  }
});

// An unpicked picker holds "" (or undefined once a form is reset), and the
// message under it has to say what to do. A malformed id that is not empty
// still gets the schema's own message: that one is a data problem, reachable
// only by a direct call.
const MALFORMED = "Invalid ID format. Expected a CUID.";

const fieldErrors = (
  parsed: { success: boolean; error?: z.ZodError },
  field: string,
) =>
  (z.flattenError(parsed.error!).fieldErrors as Record<string, string[]>)[
    field
  ];

test("createFosterPlacementSchema: an unpicked animal or foster says to pick one", () => {
  for (const unpicked of ["", undefined]) {
    const result = schema.safeParse({
      ...baseInput,
      animalId: unpicked,
      fosterProfileId: unpicked,
    });
    assert.equal(result.success, false);
    assert.deepEqual(fieldErrors(result, "animalId"), ["Pick an animal."]);
    assert.deepEqual(fieldErrors(result, "fosterProfileId"), [
      "Pick a foster.",
    ]);
  }
});

test("createFosterPlacementSchema: a malformed id keeps the schema's message", () => {
  const result = schema.safeParse({
    ...baseInput,
    animalId: "not an id",
    fosterProfileId: "NOT-A-CUID",
  });
  assert.equal(result.success, false);
  assert.deepEqual(fieldErrors(result, "animalId"), [MALFORMED]);
  assert.deepEqual(fieldErrors(result, "fosterProfileId"), [MALFORMED]);
});

test("ReturnFromFosterSchema: an unpicked unit says to pick one", () => {
  const unpicked = ReturnFromFosterSchema.safeParse({
    ...returnInput,
    unitId: "",
  });
  assert.equal(unpicked.success, false);
  assert.deepEqual(fieldErrors(unpicked, "unitId"), ["Pick a unit."]);

  const malformed = ReturnFromFosterSchema.safeParse({
    ...returnInput,
    unitId: "not an id",
  });
  assert.deepEqual(fieldErrors(malformed, "unitId"), [MALFORMED]);
});

test("CreateFosterProfileSchema: an unpicked person says to pick one", () => {
  const input = { speciesIds: ["cmtn2bxpz00gancgsd6hyf79q"], maxAnimals: 1 };
  const unpicked = CreateFosterProfileSchema.safeParse({
    ...input,
    personId: "",
  });
  assert.equal(unpicked.success, false);
  assert.deepEqual(fieldErrors(unpicked, "personId"), ["Pick a person."]);

  const malformed = CreateFosterProfileSchema.safeParse({
    ...input,
    personId: "not an id",
  });
  assert.deepEqual(fieldErrors(malformed, "personId"), [MALFORMED]);

  const picked = CreateFosterProfileSchema.safeParse({
    ...input,
    personId: "cmtn2bxpz00gancgsd6hyf79r",
  });
  assert.equal(picked.success, true);
});
