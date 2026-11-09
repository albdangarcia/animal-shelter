import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  MedicalItemKind,
  MedicationOrderEventAction,
  type DoseSlot,
  type DoseUnit,
  type MedicalRoute,
  type MedicationFrequency,
} from "@/prisma/generated/enums";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import {
  calendarDay,
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  beforeIntakeIssue,
  latestDueDate,
  MAX_SCHEDULE_AHEAD_YEARS,
} from "@/app/lib/utils/medical-days";
import { slotsFor } from "@/app/lib/utils/medication-slots";
import {
  DOSE_SLOT_LABELS,
  MAX_EVERY_N_DAYS,
  MEDICAL_ITEM_KIND_LABELS,
  MEDICAL_REASON_MAX_LENGTH,
  MEDICATION_FREQUENCY_LABELS,
  MEDICATION_INSTRUCTIONS_MAX_LENGTH,
  MEDICATION_PRESCRIBED_BY_MAX_LENGTH,
  MIN_EVERY_N_DAYS,
} from "@/app/lib/constants/medical";
import { lockMedicalItemForUse } from "@/app/lib/services/medical-catalog";
import { MedicalEntryRefusal, tidy } from "@/app/lib/services/medical-entry-values";
import { readAnimal, type AnimalFacts } from "@/app/lib/services/medical-entry";
import {
  describeProseChange,
  describeValueChange,
  joinList,
} from "@/app/lib/services/medical-entry-text";
import { orderDoseText, orderText } from "@/app/lib/services/medication-text";

/**
 * An animal's medication orders: ordering one, correcting it, discontinuing
 * it, and voiding one recorded in error.
 *
 * An order is a course of one catalog medication: a dose, a unit, a route
 * and a frequency, from a start day through an optional end day. It expects
 * a dose in each of its frequency's slots on each day it runs, from its
 * first slot on the start day (`medication-slots.ts` works out which). Its
 * medication, dose, unit, route and frequency never change: changing them
 * would rewrite what the doses already recorded, and the slots already
 * missed, meant. Staff discontinue the order and order again.
 *
 * An order ends on its end day, or is discontinued from a day with a reason,
 * after which no slot is expected; a dose already recorded stays. Whether it
 * is upcoming, active or ended is worked out on read from its days, never
 * stored. A correction changes the instructions, the prescriber and the end
 * day, and the start day and first slot only while no dose is recorded. A
 * void is written once and never undone; a voided order and its doses are
 * kept and count for nothing.
 *
 * Every change writes an event holding the values it changed, as a care
 * episode's do, and a line in the animal's activity feed. Every write takes
 * the animal's lock first, then reads the order, so what a dose written at
 * the same moment changed is seen. This module has **no `next/*` and no auth
 * imports**, so the seed and the database tests can drive it. It runs inside
 * the caller's `prisma.$transaction`, and takes the shelter's today as an
 * argument.
 */

/** An order as the order form or a caller gives it. */
export interface MedicationOrderInput {
  animalId: string;
  /** A live `MEDICATION` catalog item for the animal's species. */
  itemId: string;
  doseAmount: number;
  doseUnit: DoseUnit;
  route: MedicalRoute;
  frequency: MedicationFrequency;
  /** Days between doses: for `EVERY_N_DAYS` only, and always then. */
  intervalDays?: number | null;
  startDate: CalendarDay;
  /** The frequency's slot first due on the start day; none for `PRN`. */
  firstSlot?: DoseSlot | null;
  /** The last day it runs, inclusive; none runs until discontinued. */
  endDate?: CalendarDay | null;
  instructions?: string | null;
  prescribedBy?: string | null;
}

/** What a correction may change. A field left out keeps what is stored, and
 * `null` clears it. */
export interface MedicationOrderCorrection {
  startDate?: CalendarDay;
  firstSlot?: DoseSlot | null;
  endDate?: CalendarDay | null;
  instructions?: string | null;
  prescribedBy?: string | null;
}

export type MedicationOrderEdit =
  | { status: "edited"; orderId: string; animalId: string; changeSummary: string }
  | { status: "unchanged"; orderId: string; animalId: string };

/** What a correction can change, flat and keyed by field name, as the
 * events record it. */
interface CorrectableValues {
  startDate: CalendarDay;
  firstSlot: DoseSlot | null;
  endDate: CalendarDay | null;
  instructions: string | null;
  prescribedBy: string | null;
}

type CorrectableField = keyof CorrectableValues;

// In the order a correction's text lists them.
const FIELDS: CorrectableField[] = [
  "startDate",
  "firstSlot",
  "endDate",
  "prescribedBy",
  "instructions",
];

const ORDER_SELECT = {
  animalId: true,
  itemId: true,
  doseAmount: true,
  doseUnit: true,
  route: true,
  frequency: true,
  intervalDays: true,
  startDate: true,
  firstSlot: true,
  endDate: true,
  instructions: true,
  prescribedBy: true,
  discontinuedDate: true,
  voidedAt: true,
  item: { select: { name: true } },
} as const satisfies Prisma.MedicationOrderSelect;

type StoredOrder = Prisma.MedicationOrderGetPayload<{ select: typeof ORDER_SELECT }>;

const asJson = (value: object) => value as Prisma.InputJsonObject;

/** The words of the order's line, from what is stored. */
const textFields = (order: StoredOrder) => ({
  itemName: order.item.name,
  doseAmount: order.doseAmount,
  doseUnit: order.doseUnit,
  route: order.route,
  frequency: order.frequency,
  intervalDays: order.intervalDays,
  startDate: calendarDay(order.startDate),
  endDate: order.endDate ? calendarDay(order.endDate) : null,
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * The medication: a live `MEDICATION` item for every species or the
 * animal's. Held against a catalog change (its kind, its retirement) until
 * the transaction ends, so the check and the order land together. Returns
 * its name.
 */
const checkMedication = async (
  tx: TransactionClient,
  itemId: string,
  animal: AnimalFacts,
): Promise<string> => {
  await lockMedicalItemForUse(tx, itemId);
  const item = await tx.medicalItem.findUnique({
    where: { id: itemId },
    select: { name: true, kind: true, retiredAt: true },
  });
  if (!item) {
    throw new MedicalEntryRefusal("That medication no longer exists.", "itemId");
  }
  if (item.kind !== MedicalItemKind.MEDICATION) {
    throw new MedicalEntryRefusal(
      `${item.name} is a ${MEDICAL_ITEM_KIND_LABELS[item.kind].toLowerCase()}, not a medication.`,
      "itemId",
    );
  }
  if (item.retiredAt) {
    throw new MedicalEntryRefusal(
      `${item.name} has been retired from the catalog and can't be ordered.`,
      "itemId",
    );
  }
  // Read after the item, not beside it: a transaction is one connection.
  const species = await tx.species.findMany({
    where: { medicalItems: { some: { id: itemId } } },
    select: { id: true },
  });
  if (species.length > 0 && !species.some(({ id }) => id === animal.speciesId)) {
    throw new MedicalEntryRefusal(`${item.name} isn't for this animal's species.`, "itemId");
  }
  return item.name;
};

const checkDose = ({ doseAmount, doseUnit, route }: MedicationOrderInput) => {
  if (!Number.isFinite(doseAmount) || doseAmount <= 0) {
    throw new MedicalEntryRefusal("The dose must be more than 0.", "doseAmount");
  }
  if (!doseUnit) {
    throw new MedicalEntryRefusal("Pick the dose's unit.", "doseUnit");
  }
  if (!route) {
    throw new MedicalEntryRefusal("Pick the route.", "route");
  }
};

/** Days between doses for an every-few-days order, and only for one. */
const checkInterval = (frequency: MedicationFrequency, intervalDays: number | null) => {
  if (frequency !== "EVERY_N_DAYS") {
    if (intervalDays !== null) {
      throw new MedicalEntryRefusal(
        "Only an order given every few days has days between doses.",
        "intervalDays",
      );
    }
    return;
  }
  if (intervalDays === null) {
    throw new MedicalEntryRefusal("Give the days between doses.", "intervalDays");
  }
  if (
    !Number.isInteger(intervalDays) ||
    intervalDays < MIN_EVERY_N_DAYS ||
    intervalDays > MAX_EVERY_N_DAYS
  ) {
    throw new MedicalEntryRefusal(
      `An order given every few days is given every ${MIN_EVERY_N_DAYS} to ${MAX_EVERY_N_DAYS} days.`,
      "intervalDays",
    );
  }
};

/** The first slot is one of the frequency's; an as-needed order has none. */
const checkFirstSlot = (frequency: MedicationFrequency, firstSlot: DoseSlot | null) => {
  const slots = slotsFor(frequency);
  if (slots.length === 0) {
    if (firstSlot) {
      throw new MedicalEntryRefusal("An as-needed order has no slots.", "firstSlot");
    }
    return;
  }
  if (!firstSlot) {
    throw new MedicalEntryRefusal("Pick the slot of the first dose.", "firstSlot");
  }
  if (!slots.includes(firstSlot)) {
    throw new MedicalEntryRefusal(
      `An order given ${MEDICATION_FREQUENCY_LABELS[frequency].toLowerCase()} has no ${DOSE_SLOT_LABELS[firstSlot]} dose.`,
      "firstSlot",
    );
  }
};

const ceilingIssue = (day: CalendarDay, today: CalendarDay, label: string) =>
  day > latestDueDate(today)
    ? `${label} can't be more than ${MAX_SCHEDULE_AHEAD_YEARS} years from today.`
    : null;

/** The start day: from the animal's latest intake (backdating allowed) to
 * five years ahead. */
const checkStartDate = (startDate: CalendarDay, animal: AnimalFacts, today: CalendarDay) => {
  const issue =
    beforeIntakeIssue(startDate, animal.latestIntakeDate, "The start date") ??
    ceilingIssue(startDate, today, "The start date");
  if (issue) throw new MedicalEntryRefusal(issue, "startDate");
};

/** The end day, inclusive: on or after the start, at most five years ahead. */
const checkEndDate = (
  startDate: CalendarDay,
  endDate: CalendarDay | null,
  today: CalendarDay,
) => {
  if (!endDate) return;
  const issue =
    (endDate < startDate ? "The end date can't be before the start date." : null) ??
    ceilingIssue(endDate, today, "The end date");
  if (issue) throw new MedicalEntryRefusal(issue, "endDate");
};

const checkText = ({
  instructions,
  prescribedBy,
}: Pick<CorrectableValues, "instructions" | "prescribedBy">) => {
  if (instructions && instructions.length > MEDICATION_INSTRUCTIONS_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The instructions can't be longer than ${MEDICATION_INSTRUCTIONS_MAX_LENGTH} characters.`,
      "instructions",
    );
  }
  if (prescribedBy && prescribedBy.length > MEDICATION_PRESCRIBED_BY_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `"Prescribed by" can't be longer than ${MEDICATION_PRESCRIBED_BY_MAX_LENGTH} characters.`,
      "prescribedBy",
    );
  }
};

const checkReason = (reason: string, required: string) => {
  if (!reason) throw new MedicalEntryRefusal(required, "reason");
  if (reason.length > MEDICAL_REASON_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The reason can't be longer than ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      "reason",
    );
  }
};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

/**
 * Orders a medication for an animal in the shelter's care. The start day may
 * be in the past (an order written up late) or ahead; its earlier slots that
 * day aren't expected, from `firstSlot` on.
 */
export async function createMedicationOrder(
  tx: TransactionClient,
  input: MedicationOrderInput,
  actorId: string,
  today: CalendarDay,
): Promise<{ orderId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so no medication can be ordered for it.",
    );
  }
  const itemName = await checkMedication(tx, input.itemId, animal);
  checkDose(input);
  const intervalDays = input.intervalDays ?? null;
  checkInterval(input.frequency, intervalDays);
  const firstSlot = input.firstSlot ?? null;
  checkFirstSlot(input.frequency, firstSlot);
  const endDate = input.endDate ?? null;
  checkStartDate(input.startDate, animal, today);
  checkEndDate(input.startDate, endDate, today);
  const text = {
    instructions: tidy(input.instructions),
    prescribedBy: tidy(input.prescribedBy),
  };
  checkText(text);

  const values = {
    itemId: input.itemId,
    doseAmount: input.doseAmount,
    doseUnit: input.doseUnit,
    route: input.route,
    frequency: input.frequency,
    intervalDays,
    startDate: input.startDate,
    firstSlot,
    endDate,
    ...text,
  };
  const { id: orderId } = await tx.medicationOrder.create({
    data: { ...values, animalId, createdById: actorId },
    select: { id: true },
  });
  await tx.medicationOrderEvent.create({
    data: {
      orderId,
      action: MedicationOrderEventAction.CREATED,
      actorId,
      after: asJson(values),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICATION_ORDERED,
      changedById: actorId,
      changeSummary: `${orderText({ ...values, itemName })}, ordered.`,
    },
  });

  return { orderId, animalId };
}

// An order's animal never changes, so it can be read before the lock.
const locateOrder = async (tx: TransactionClient, orderId: string) => {
  const located = await tx.medicationOrder.findUnique({
    where: { id: orderId },
    select: { animalId: true },
  });
  if (!located) throw new NotFoundError("Medication order not found.");
  return located.animalId;
};

const readOrder = (tx: TransactionClient, orderId: string) =>
  tx.medicationOrder.findUniqueOrThrow({ where: { id: orderId }, select: ORDER_SELECT });

/** The latest day with a live dose of the order, or null with none. */
const latestDoseDay = async (
  tx: TransactionClient,
  orderId: string,
): Promise<CalendarDay | null> => {
  const latest = await tx.medicationDose.findFirst({
    where: { orderId, voidedAt: null },
    orderBy: { slotDate: "desc" },
    select: { slotDate: true },
  });
  return latest ? calendarDay(latest.slotDate) : null;
};

const correctableOf = (order: StoredOrder): CorrectableValues => ({
  startDate: calendarDay(order.startDate),
  firstSlot: order.firstSlot,
  endDate: order.endDate ? calendarDay(order.endDate) : null,
  instructions: order.instructions,
  prescribedBy: order.prescribedBy,
});

const kept = <F extends CorrectableField>(
  input: MedicationOrderCorrection,
  before: CorrectableValues,
  field: F,
): CorrectableValues[F] =>
  input[field] === undefined ? before[field] : (input[field] as CorrectableValues[F]);

const FIELD_LABELS: Record<Exclude<CorrectableField, "instructions">, string> = {
  startDate: "start date",
  firstSlot: "first slot",
  endDate: "end date",
  prescribedBy: "prescriber",
};

const displayValue = (
  field: Exclude<CorrectableField, "instructions">,
  values: CorrectableValues,
): string | null => {
  switch (field) {
    case "startDate":
    case "endDate":
      return values[field] ? formatShelterDay(values[field]) : null;
    case "firstSlot":
      return values.firstSlot ? DOSE_SLOT_LABELS[values.firstSlot] : null;
    case "prescribedBy":
      return values.prescribedBy;
  }
};

const describeChange = (
  field: CorrectableField,
  before: CorrectableValues,
  after: CorrectableValues,
) =>
  field === "instructions"
    ? describeProseChange("instructions", before.instructions, after.instructions)
    : describeValueChange(
        FIELD_LABELS[field],
        displayValue(field, before),
        displayValue(field, after),
      );

/**
 * Corrects an order's instructions, prescriber and end day, and, while it
 * has no live dose, its start day and first slot. Writes an EDITED event
 * holding the before and after values of only what changed. A day is checked
 * when it changes, so an order kept from an earlier stay can still have its
 * instructions corrected. The end day can't move before a day with a live
 * dose. A voided or discontinued order isn't corrected; a correction that
 * changes nothing writes nothing.
 */
export async function editMedicationOrder(
  tx: TransactionClient,
  orderId: string,
  input: MedicationOrderCorrection,
  actorId: string,
  today: CalendarDay,
): Promise<MedicationOrderEdit> {
  const animalId = await locateOrder(tx, orderId);
  await lockAnimal(tx, animalId);

  const order = await readOrder(tx, orderId);
  if (order.voidedAt) {
    throw new ConflictError("This order was voided, so it can't be edited.");
  }
  if (order.discontinuedDate) {
    throw new ConflictError(
      "This order was discontinued, so it can't be edited. Order it again instead.",
    );
  }
  const before = correctableOf(order);
  const after: CorrectableValues = {
    startDate: kept(input, before, "startDate"),
    firstSlot: kept(input, before, "firstSlot") ?? null,
    endDate: kept(input, before, "endDate") ?? null,
    instructions:
      input.instructions === undefined ? before.instructions : tidy(input.instructions),
    prescribedBy:
      input.prescribedBy === undefined ? before.prescribedBy : tidy(input.prescribedBy),
  };
  const changed = FIELDS.filter((field) => after[field] !== before[field]);
  if (changed.length === 0) {
    return { status: "unchanged", orderId, animalId };
  }

  const latestDose = await latestDoseDay(tx, orderId);
  for (const field of ["startDate", "firstSlot"] as const) {
    if (changed.includes(field) && latestDose) {
      throw new MedicalEntryRefusal(
        `The ${FIELD_LABELS[field]} can't change once a dose is recorded. Discontinue the order and order it again instead.`,
        field,
      );
    }
  }
  if (changed.includes("startDate")) {
    checkStartDate(after.startDate, await readAnimal(tx, animalId), today);
  }
  if (changed.includes("firstSlot")) {
    checkFirstSlot(order.frequency, after.firstSlot);
  }
  if (changed.includes("startDate") || changed.includes("endDate")) {
    checkEndDate(after.startDate, after.endDate, today);
  }
  if (changed.includes("endDate") && after.endDate && latestDose && after.endDate < latestDose) {
    throw new MedicalEntryRefusal(
      `The end date can't be before ${formatShelterDay(latestDose)}: a dose is recorded on that day.`,
      "endDate",
    );
  }
  checkText(after);

  const pick = (values: CorrectableValues) =>
    Object.fromEntries(changed.map((field) => [field, values[field]]));
  await tx.medicationOrder.update({ where: { id: orderId }, data: pick(after) });
  await tx.medicationOrderEvent.create({
    data: {
      orderId,
      action: MedicationOrderEventAction.EDITED,
      actorId,
      before: asJson(pick(before)),
      after: asJson(pick(after)),
    },
  });
  const changeSummary = `${orderDoseText(textFields(order))}, was corrected: ${joinList(
    changed.map((field) => describeChange(field, before, after)),
  )}.`;
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICATION_ORDER_EDITED,
      changedById: actorId,
      changeSummary,
    },
  });

  return { status: "edited", orderId, animalId, changeSummary };
}

/**
 * Discontinues an order from `day`, the first day it no longer runs: no slot
 * on or after it is expected, and a dose already recorded on it stays. The
 * day is not after today, not before the last day with a live dose, and not
 * before the start; an order that hasn't started yet is discontinued from
 * today. An order already over by `day` has nothing left to discontinue.
 */
export async function discontinueMedicationOrder(
  tx: TransactionClient,
  orderId: string,
  input: { day: CalendarDay; reason: string },
  actorId: string,
  today: CalendarDay,
): Promise<{ orderId: string; animalId: string }> {
  const reason = input.reason.trim();
  checkReason(reason, "Say why the order is being discontinued.");
  const { day } = input;

  const animalId = await locateOrder(tx, orderId);
  await lockAnimal(tx, animalId);
  const order = await readOrder(tx, orderId);
  if (order.voidedAt) {
    throw new ConflictError("This order was voided, so it can't be discontinued.");
  }
  if (order.discontinuedDate) {
    throw new ConflictError(
      `This order was already discontinued from ${formatShelterDay(calendarDay(order.discontinuedDate))}.`,
    );
  }

  const startDate = calendarDay(order.startDate);
  if (day > today) {
    throw new MedicalEntryRefusal("The discontinue date can't be in the future.", "day");
  }
  if (startDate > today) {
    if (day !== today) {
      throw new MedicalEntryRefusal(
        "This order hasn't started yet, so it is discontinued from today.",
        "day",
      );
    }
  } else if (day < startDate) {
    throw new MedicalEntryRefusal(
      `The order can't be discontinued before it started on ${formatShelterDay(startDate)}.`,
      "day",
    );
  }
  const latestDose = await latestDoseDay(tx, orderId);
  if (latestDose && day < latestDose) {
    throw new MedicalEntryRefusal(
      `The order can't be discontinued before ${formatShelterDay(latestDose)}: a dose is recorded on that day.`,
      "day",
    );
  }
  if (order.endDate && order.endDate < day) {
    throw new MedicalEntryRefusal(
      `This order ended on ${formatShelterDay(calendarDay(order.endDate))}, before ${formatShelterDay(day)}, so there is nothing left to discontinue.`,
      "day",
    );
  }

  await tx.medicationOrder.update({
    where: { id: orderId },
    data: { discontinuedDate: day, discontinueReason: reason, discontinuedById: actorId },
  });
  await tx.medicationOrderEvent.create({
    data: {
      orderId,
      action: MedicationOrderEventAction.DISCONTINUED,
      actorId,
      before: { discontinuedDate: null },
      after: { discontinuedDate: day, discontinueReason: reason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICATION_DISCONTINUED,
      changedById: actorId,
      changeSummary: `${orderDoseText(textFields(order))}, discontinued from ${formatShelterDay(day)}. Reason: ${reason}`,
    },
  });

  return { orderId, animalId };
}

/**
 * Voids an order recorded in error. Write-once: an order already voided is
 * refused, and nothing un-voids one. The order and its doses stay on the
 * record and count for nothing: no slot is expected, and none is missed.
 */
export async function voidMedicationOrder(
  tx: TransactionClient,
  orderId: string,
  reason: string,
  actorId: string,
): Promise<{ orderId: string; animalId: string }> {
  const trimmedReason = reason.trim();
  checkReason(trimmedReason, "A reason for voiding this order is required.");

  const animalId = await locateOrder(tx, orderId);
  // Taken before the re-read, so two voids of one order at once can't both
  // see it live.
  await lockAnimal(tx, animalId);
  const order = await readOrder(tx, orderId);
  if (order.voidedAt) {
    throw new ConflictError(
      "This order has already been voided. A void can't be undone: if it was voided by mistake, order it again.",
    );
  }

  await tx.medicationOrder.update({
    where: { id: orderId },
    data: { voidedAt: new Date(), voidedById: actorId, voidReason: trimmedReason },
  });
  await tx.medicationOrderEvent.create({
    data: {
      orderId,
      action: MedicationOrderEventAction.VOIDED,
      actorId,
      after: { voidReason: trimmedReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICATION_ORDER_VOIDED,
      changedById: actorId,
      changeSummary: `${orderText(textFields(order))}, was voided. Reason: ${trimmedReason}`,
    },
  });

  return { orderId, animalId };
}
