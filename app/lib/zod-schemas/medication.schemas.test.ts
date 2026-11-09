import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DiscontinueMedicationOrderSchema,
  DoseSlotSchema,
  MedicationDoseFormSchema,
  MedicationDosesGivenSchema,
  MedicationOrderCorrectionSchema,
  MedicationOrderFormSchema,
  VoidMedicationDoseSchema,
  VoidMedicationOrderSchema,
  type MedicationDoseFormInput,
  type MedicationOrderCorrectionInput,
  type MedicationOrderFormInput,
} from "./medication.schemas";

const order: MedicationOrderFormInput = {
  itemId: "cmmedication0000000000000",
  doseAmount: 100,
  doseUnit: "MG",
  route: "ORAL",
  frequency: "BID",
  intervalDays: null,
  startDate: "2026-10-12",
  firstSlot: "PM",
  endDate: "",
  instructions: "",
  prescribedBy: "",
};

const errorsOf = <T extends z.ZodType>(schema: T, values: z.input<T>) => {
  const result = schema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
};

test("MedicationOrderFormSchema: text is trimmed, and blanks read as none", () => {
  assert.deepEqual(
    MedicationOrderFormSchema.parse({
      ...order,
      endDate: "2026-11-10",
      instructions: "  With food. ",
      prescribedBy: " ",
    }),
    {
      itemId: "cmmedication0000000000000",
      doseAmount: 100,
      doseUnit: "MG",
      route: "ORAL",
      frequency: "BID",
      intervalDays: null,
      startDate: "2026-10-12",
      firstSlot: "PM",
      endDate: "2026-11-10",
      instructions: "With food.",
      prescribedBy: null,
    },
  );
});

test("MedicationOrderFormSchema: the medication, dose, unit, route, frequency and start are required", () => {
  const errors = errorsOf(MedicationOrderFormSchema, {
    ...order,
    itemId: "",
    doseAmount: null as unknown as number,
    doseUnit: null as unknown as "MG",
    route: null as unknown as "ORAL",
    frequency: null as unknown as "BID",
    startDate: "",
  });
  assert.deepEqual(errors.itemId, ["Pick a medication."]);
  assert.deepEqual(errors.doseAmount, ["Give the dose."]);
  assert.deepEqual(errors.doseUnit, ["Pick the dose's unit."]);
  assert.deepEqual(errors.route, ["Pick the route."]);
  assert.deepEqual(errors.frequency, ["Pick how often."]);
  assert.deepEqual(errors.startDate, ["The start date is required."]);
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...order, doseAmount: 0 }).doseAmount, [
    "The dose must be more than 0.",
  ]);
});

test("MedicationOrderFormSchema: days between doses only, and always, every few days, 2 to 31", () => {
  const everyFew = { ...order, frequency: "EVERY_N_DAYS" as const, firstSlot: "AM" as const };
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, everyFew).intervalDays, [
    "Give the days between doses.",
  ]);
  for (const intervalDays of [1, 32]) {
    assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...everyFew, intervalDays }).intervalDays, [
      "An order given every few days is given every 2 to 31 days.",
    ]);
  }
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...everyFew, intervalDays: 2.5 }).intervalDays, [
    "Use a whole number of days.",
  ]);
  for (const intervalDays of [2, 31]) {
    assert.equal(MedicationOrderFormSchema.safeParse({ ...everyFew, intervalDays }).success, true);
  }
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...order, intervalDays: 3 }).intervalDays, [
    "Only an order given every few days has days between doses.",
  ]);
});

test("MedicationOrderFormSchema: the first slot is one of the frequency's, and none as needed", () => {
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...order, firstSlot: "" }).firstSlot, [
    "Pick the slot of the first dose.",
  ]);
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...order, firstSlot: "MIDDAY" }).firstSlot, [
    "An order given twice a day has no Midday dose.",
  ]);
  assert.deepEqual(
    errorsOf(MedicationOrderFormSchema, { ...order, frequency: "SID", firstSlot: "PM" }).firstSlot,
    ["An order given once a day has no PM dose."],
  );
  assert.deepEqual(
    errorsOf(MedicationOrderFormSchema, { ...order, frequency: "PRN", firstSlot: "AM" }).firstSlot,
    ["An as-needed order has no slots."],
  );
  assert.equal(
    MedicationOrderFormSchema.parse({ ...order, frequency: "PRN", firstSlot: "" }).firstSlot,
    null,
  );
  assert.equal(
    MedicationOrderFormSchema.safeParse({ ...order, frequency: "TID", firstSlot: "MIDDAY" }).success,
    true,
  );
});

test("MedicationOrderFormSchema: the end is on or after the start, and the text has its limits", () => {
  assert.deepEqual(errorsOf(MedicationOrderFormSchema, { ...order, endDate: "2026-10-11" }).endDate, [
    "The end date can't be before the start date.",
  ]);
  assert.equal(MedicationOrderFormSchema.safeParse({ ...order, endDate: "2026-10-12" }).success, true);
  const errors = errorsOf(MedicationOrderFormSchema, {
    ...order,
    instructions: "x".repeat(1001),
    prescribedBy: "x".repeat(121),
  });
  assert.deepEqual(errors.instructions, ["Must be 1000 characters or fewer."]);
  assert.deepEqual(errors.prescribedBy, ["Must be 120 characters or fewer."]);
});

test("MedicationOrderCorrectionSchema: the first slot against the order's frequency, and the end after the start", () => {
  const correction: MedicationOrderCorrectionInput = {
    frequency: "SID",
    startDate: "2026-10-12",
    firstSlot: "AM",
    endDate: "",
    instructions: "",
    prescribedBy: "",
  };
  assert.deepEqual(MedicationOrderCorrectionSchema.parse(correction), {
    frequency: "SID",
    startDate: "2026-10-12",
    firstSlot: "AM",
    endDate: null,
    instructions: null,
    prescribedBy: null,
  });
  const errors = errorsOf(MedicationOrderCorrectionSchema, {
    ...correction,
    firstSlot: "PM",
    endDate: "2026-10-01",
  });
  assert.deepEqual(errors.firstSlot, ["An order given once a day has no PM dose."]);
  assert.deepEqual(errors.endDate, ["The end date can't be before the start date."]);
});

test("DiscontinueMedicationOrderSchema and VoidMedicationOrderSchema: the day and the reason are required", () => {
  const errors = errorsOf(DiscontinueMedicationOrderSchema, { day: "", reason: " " });
  assert.deepEqual(errors.day, ["The discontinue date is required."]);
  assert.deepEqual(errors.reason, ["Say why the order is being discontinued."]);
  assert.deepEqual(
    DiscontinueMedicationOrderSchema.parse({ day: "2026-10-15", reason: " Stools normal again. " }),
    { day: "2026-10-15", reason: "Stools normal again." },
  );
  assert.deepEqual(errorsOf(VoidMedicationOrderSchema, { reason: "" }).reason, [
    "A reason for voiding this order is required.",
  ]);
});

const dose: MedicationDoseFormInput = {
  result: "GIVEN",
  reason: "",
  givenDate: "",
  givenTime: "",
  notes: "",
};

test("MedicationDoseFormSchema: a dose given now sends its result alone", () => {
  assert.deepEqual(MedicationDoseFormSchema.parse({ result: "GIVEN" }), {
    result: "GIVEN",
    reason: null,
    givenDate: null,
    givenTime: null,
    notes: null,
  });
  assert.deepEqual(
    MedicationDoseFormSchema.parse({
      ...dose,
      result: "REFUSED",
      reason: " Spat it out ",
      givenDate: "2026-10-14",
      givenTime: "20:15",
      notes: " Tried twice. ",
    }),
    {
      result: "REFUSED",
      reason: "Spat it out",
      givenDate: "2026-10-14",
      givenTime: "20:15",
      notes: "Tried twice.",
    },
  );
});

test("MedicationDoseFormSchema: not given needs a reason, and a dose given has none", () => {
  assert.deepEqual(errorsOf(MedicationDoseFormSchema, { ...dose, result: "NOT_GIVEN" }).reason, [
    "Say why the dose wasn't given.",
  ]);
  assert.deepEqual(errorsOf(MedicationDoseFormSchema, { ...dose, reason: "Asleep" }).reason, [
    "A dose given has no reason.",
  ]);
  // Refused may have one or not.
  assert.equal(MedicationDoseFormSchema.safeParse({ ...dose, result: "REFUSED" }).success, true);
  assert.deepEqual(errorsOf(MedicationDoseFormSchema, { ...dose, result: undefined as never }).result, [
    "Pick what happened.",
  ]);
});

test("MedicationDoseFormSchema: the day and the time given come together, as a time of day", () => {
  assert.deepEqual(errorsOf(MedicationDoseFormSchema, { ...dose, givenDate: "2026-10-14" }).givenTime, [
    "Give the time as well.",
  ]);
  assert.deepEqual(errorsOf(MedicationDoseFormSchema, { ...dose, givenTime: "08:30" }).givenDate, [
    "Pick the date as well.",
  ]);
  for (const time of ["8:30", "24:00", "08:60", "noon"]) {
    assert.deepEqual(
      errorsOf(MedicationDoseFormSchema, { ...dose, givenDate: "2026-10-14", givenTime: time }).givenTime,
      ["Enter a time of day, such as 08:30."],
      time,
    );
  }
  assert.deepEqual(
    errorsOf(MedicationDoseFormSchema, { ...dose, notes: "x".repeat(2001) }).notes,
    ["Must be 2000 characters or fewer."],
  );
});

test("DoseSlotSchema, MedicationDosesGivenSchema and VoidMedicationDoseSchema", () => {
  assert.deepEqual(DoseSlotSchema.parse({ slotDate: "2026-10-14", slot: null }), {
    slotDate: "2026-10-14",
    slot: null,
  });
  assert.equal(DoseSlotSchema.safeParse({ slotDate: "2026-10-14", slot: "NOON" }).success, false);

  const slot = { orderId: "cmmedication0000000000000", slotDate: "2026-10-14", slot: "AM" as const };
  assert.equal(MedicationDosesGivenSchema.safeParse([slot]).success, true);
  assert.equal(MedicationDosesGivenSchema.safeParse([]).success, false);
  assert.equal(MedicationDosesGivenSchema.safeParse(Array(51).fill(slot)).success, false);
  // A batch slot always has a slot: as-needed doses aren't recorded together.
  assert.equal(MedicationDosesGivenSchema.safeParse([{ ...slot, slot: null }]).success, false);

  assert.deepEqual(errorsOf(VoidMedicationDoseSchema, { reason: " " }).reason, [
    "A reason for voiding this dose is required.",
  ]);
});
