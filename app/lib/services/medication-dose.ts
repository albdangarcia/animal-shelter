import { randomUUID } from "node:crypto";
import type { TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  MedicationDoseResult,
  type DoseSlot,
} from "@/prisma/generated/enums";
import {
  attachCause,
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import {
  formatShelterDay,
  startOfShelterDay,
  calendarDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { resolveShelterSettings } from "@/app/lib/utils/shelter-settings";
import { slotDoseIssue, slotOrderOf } from "@/app/lib/utils/medication-slots";
import {
  MAX_BATCH_SIZE,
  MEDICAL_REASON_MAX_LENGTH,
  MEDICATION_DOSE_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { MedicalEntryRefusal, tidy } from "@/app/lib/services/medical-entry-values";
import { readAnimal } from "@/app/lib/services/medical-entry";
import {
  MedicalBatchRefusal,
  type MedicalBatchAnimalRefusal,
} from "@/app/lib/services/medical-batch";
import { doseSlotText } from "@/app/lib/services/medication-text";
import { checkFostering } from "@/app/lib/data/fosters/foster-access";

/**
 * The doses recorded against medication orders: one slot as given, refused
 * or not given, several slots given together from the dose sheet, and a void
 * for one recorded in error.
 *
 * A dose accounts for one slot the order expects, from its start through
 * today (a later slot today included: early is allowed), or, for an
 * as-needed order, for no slot at all, any number a day. A slot holds one
 * live dose; a partial unique index backs that when two are recorded at
 * once. A dose is never edited: a wrong one is voided with a reason, and the
 * slot recorded again. A dose given writes no activity row, since the dose
 * sheet is its record; refused, not given and voided doses do.
 *
 * Every write takes the animal's lock first, then reads the order, so an
 * order discontinued or voided at the same moment is seen. This module has
 * **no `next/*` and no auth imports**, so the seed and the database tests can
 * drive it. It runs inside the caller's `prisma.$transaction`, and takes the
 * shelter's today and the instant now, read together, as arguments.
 */

/** One dose as the dose sheet or a form gives it. */
export interface MedicationDoseInput {
  orderId: string;
  slotDate: CalendarDay;
  /** The slot it accounts for; none for an as-needed order. */
  slot: DoseSlot | null;
  result: MedicationDoseResult;
  /** Required when not given, optional when refused, none when given. */
  reason?: string | null;
  /** When it was given or tried; left out means now. */
  administeredAt?: Date | null;
  notes?: string | null;
}

/** One slot to record as given, in a batch from the dose sheet. */
export interface MedicationSlotInput {
  orderId: string;
  slotDate: CalendarDay;
  slot: DoseSlot;
}

/** Doses recorded together share it, as provenance only. */
export interface DoseWriteOptions {
  batch?: { batchId: string };
  foster?: { personId: string };
}

const ORDER_SELECT = {
  animalId: true,
  frequency: true,
  intervalDays: true,
  startDate: true,
  firstSlot: true,
  endDate: true,
  discontinuedDate: true,
  voidedAt: true,
  item: { select: { name: true } },
} as const satisfies Prisma.MedicationOrderSelect;

// An order's animal never changes, so it can be read before the lock.
const locateOrder = async (tx: TransactionClient, orderId: string) => {
  const located = await tx.medicationOrder.findUnique({
    where: { id: orderId },
    select: { animalId: true },
  });
  if (!located) throw new NotFoundError("Medication order not found.");
  return located.animalId;
};

/** The shelter's time zone, from its settings row or the fallbacks. */
const readTimezone = async (tx: TransactionClient) =>
  resolveShelterSettings(
    await tx.shelterSettings.findUnique({ where: { id: "shelter" } }),
  ).timezone;

/** Whether `error` is the slot's partial unique index refusing a second
 * live dose. */
const isSlotTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const checkReason = (result: MedicationDoseResult, reason: string | null) => {
  if (result === MedicationDoseResult.GIVEN) {
    if (reason) throw new MedicalEntryRefusal("A dose given has no reason.", "reason");
    return;
  }
  if (result === MedicationDoseResult.NOT_GIVEN && !reason) {
    throw new MedicalEntryRefusal("Say why the dose wasn't given.", "reason");
  }
  if (reason && reason.length > MEDICAL_REASON_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The reason can't be longer than ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      "reason",
    );
  }
};

/**
 * Records one dose. The slot must be one the order expects, on a day from
 * its start through today; the time given is not in the future, and not
 * before the slot's day began on the shelter's clock (a dose given late, the
 * next morning, is fine). A slot that already holds a live dose is refused.
 */
export async function recordMedicationDose(
  tx: TransactionClient,
  input: MedicationDoseInput,
  actorId: string,
  today: CalendarDay,
  now: Date,
  options: DoseWriteOptions = {},
): Promise<{ doseId: string; animalId: string }> {
  const reason = tidy(input.reason);
  checkReason(input.result, reason);
  const { slotDate, slot } = input;

  const animalId = await locateOrder(tx, input.orderId);
  await lockAnimal(tx, animalId);
  if (options.foster) {
    const placement = await checkFostering(tx, options.foster.personId, animalId);
    if (slotDate < placement.startDate) {
      throw new MedicalEntryRefusal("That slot was before this animal was placed with you.");
    }
  }
  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so no dose can be recorded for it.",
    );
  }
  const order = await tx.medicationOrder.findUniqueOrThrow({
    where: { id: input.orderId },
    select: ORDER_SELECT,
  });
  const issue = slotDoseIssue(slotOrderOf(order), { slotDate, slot }, today);
  if (issue) throw new MedicalEntryRefusal(issue);

  const administeredAt = input.administeredAt ?? now;
  if (administeredAt > now) {
    throw new MedicalEntryRefusal("The time given can't be in the future.", "administeredAt");
  }
  if (administeredAt < startOfShelterDay(slotDate, await readTimezone(tx))) {
    throw new MedicalEntryRefusal(
      `The time given can't be before ${formatShelterDay(slotDate)} began.`,
      "administeredAt",
    );
  }

  const slotText = doseSlotText({ slotDate, slot });
  const takenMessage = `The ${slotText} is already recorded.`;
  if (slot) {
    const taken = await tx.medicationDose.findFirst({
      where: { orderId: input.orderId, slotDate, slot, voidedAt: null },
      select: { id: true },
    });
    if (taken) throw new MedicalEntryRefusal(takenMessage);
  }

  // The insert runs behind a savepoint. A failed statement aborts the whole
  // Postgres transaction unless it is rolled back to one, and a batch goes on
  // to try its other slots after this one is refused.
  let doseId: string;
  await tx.$executeRaw`SAVEPOINT medication_dose_insert`;
  try {
    ({ id: doseId } = await tx.medicationDose.create({
      data: {
        orderId: input.orderId,
        animalId,
        slotDate,
        slot,
        result: input.result,
        reason,
        administeredAt,
        administeredById: actorId,
        notes: tidy(input.notes),
        batchId: options.batch?.batchId ?? null,
        createdById: actorId,
        reportedByFoster: !!options.foster,
      },
      select: { id: true },
    }));
    await tx.$executeRaw`RELEASE SAVEPOINT medication_dose_insert`;
  } catch (error) {
    try {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT medication_dose_insert`;
    } catch (rollbackError) {
      // The transaction can't go on (its connection is gone, say), so the
      // insert's own error is the one to report, never a refusal a batch
      // would carry on after.
      attachCause(error, rollbackError);
      throw error;
    }
    // Only a dose written past the animal's lock gets here; the index still
    // keeps the slot to one.
    if (isSlotTaken(error)) throw new MedicalEntryRefusal(takenMessage);
    throw error;
  }

  if (input.result !== MedicationDoseResult.GIVEN) {
    await tx.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.MEDICATION_DOSE_NOT_GIVEN,
        changedById: actorId,
        changeSummary: `${order.item.name} ${slotText}: ${MEDICATION_DOSE_RESULT_LABELS[input.result].toLowerCase()}.${reason ? ` Reason: ${reason}` : ""}`,
      },
    });
  }

  return { doseId, animalId };
}

/** A refusal one slot of a batch can meet, as opposed to a failure. */
const isRefusal = (error: unknown): error is Error =>
  error instanceof PreconditionFailedError ||
  error instanceof ConflictError ||
  error instanceof NotFoundError;

const slotKey = ({ orderId, slotDate, slot }: MedicationSlotInput) =>
  `${orderId}:${slotDate}:${slot}`;

/** A dose of a batch refused, and why; the slot is named in the message. */
export interface MedicationBatchSlotRefusal extends MedicalBatchAnimalRefusal {
  orderId: string;
  slotDate: CalendarDay;
  slot: DoseSlot;
}

/**
 * Records several slots as given now, from the dose sheet: all or nothing.
 * Every slot is tried, by the rules one dose follows; if any is refused,
 * nothing is written, and one `MedicalBatchRefusal` names each refused slot
 * (its animal, medication and slot) and why. The doses share a batch id.
 * Animals are locked in id order, so two batches over the same animals can't
 * deadlock.
 */
export async function recordMedicationDosesGiven(
  tx: TransactionClient,
  slots: MedicationSlotInput[],
  actorId: string,
  today: CalendarDay,
  now: Date,
): Promise<{ batchId: string; doses: { doseId: string; animalId: string }[] }> {
  if (slots.length === 0) {
    throw new MedicalEntryRefusal("Pick at least one dose.", "slots");
  }
  if (slots.length > MAX_BATCH_SIZE) {
    throw new MedicalEntryRefusal(
      `At most ${MAX_BATCH_SIZE} doses can be recorded at once. Record the rest in another round.`,
      "slots",
    );
  }
  if (new Set(slots.map(slotKey)).size !== slots.length) {
    throw new MedicalEntryRefusal("A dose is listed more than once.", "slots");
  }

  // An order's animal and medication never change, so they can be read
  // before the locks. Each order is read again behind its animal's lock.
  const orders = await tx.medicationOrder.findMany({
    where: { id: { in: [...new Set(slots.map((slot) => slot.orderId))] } },
    select: { id: true, animalId: true, item: { select: { name: true } } },
  });
  const byId = new Map(orders.map((order) => [order.id, order]));
  const animalIds = [...new Set(orders.map((order) => order.animalId))].sort();
  for (const animalId of animalIds) {
    await lockAnimal(tx, animalId);
  }
  const animals = await tx.animal.findMany({
    where: { id: { in: animalIds } },
    select: { id: true, name: true },
  });
  const names = new Map(animals.map((animal) => [animal.id, animal.name]));

  const batch = { batchId: randomUUID() };
  const doses: { doseId: string; animalId: string }[] = [];
  const refusals: MedicationBatchSlotRefusal[] = [];
  for (const slot of slots) {
    const order = byId.get(slot.orderId);
    try {
      if (!order) throw new NotFoundError("Medication order not found.");
      doses.push(
        await recordMedicationDose(
          tx,
          { ...slot, result: MedicationDoseResult.GIVEN },
          actorId,
          today,
          now,
          { batch },
        ),
      );
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refusals.push({
        animalId: order?.animalId ?? "",
        animalName: (order && names.get(order.animalId)) ?? "An animal",
        orderId: slot.orderId,
        slotDate: slot.slotDate,
        slot: slot.slot,
        message: order
          ? `${order.item.name} ${doseSlotText(slot)}: ${error.message}`
          : error.message,
      });
    }
  }
  if (refusals.length > 0) {
    throw new MedicalBatchRefusal(
      refusals,
      `Nothing was saved: ${refusals.length === 1 ? "1 dose was" : `${refusals.length} doses were`} refused.`,
    );
  }
  return { batchId: batch.batchId, doses };
}

/**
 * Voids a dose recorded in error. Write-once: a dose already voided is
 * refused, and nothing un-voids one. The slot can then be recorded again.
 */
export async function voidMedicationDose(
  tx: TransactionClient,
  doseId: string,
  reason: string,
  actorId: string,
): Promise<{ doseId: string; animalId: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new MedicalEntryRefusal("A reason for voiding this dose is required.", "reason");
  }
  if (trimmedReason.length > MEDICAL_REASON_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The reason can't be longer than ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      "reason",
    );
  }

  // A dose's animal never changes, so it can be read before the lock.
  const located = await tx.medicationDose.findUnique({
    where: { id: doseId },
    select: { animalId: true },
  });
  if (!located) throw new NotFoundError("Dose not found.");
  const { animalId } = located;
  // Taken before the re-read, so two voids of one dose at once can't both
  // see it live.
  await lockAnimal(tx, animalId);
  const dose = await tx.medicationDose.findUniqueOrThrow({
    where: { id: doseId },
    select: {
      slotDate: true,
      slot: true,
      result: true,
      voidedAt: true,
      order: { select: { item: { select: { name: true } } } },
    },
  });
  if (dose.voidedAt) {
    throw new ConflictError(
      "This dose has already been voided. A void can't be undone: if it was voided by mistake, record the dose again.",
    );
  }

  await tx.medicationDose.update({
    where: { id: doseId },
    data: { voidedAt: new Date(), voidedById: actorId, voidReason: trimmedReason },
  });
  const slotText = doseSlotText({ slotDate: calendarDay(dose.slotDate), slot: dose.slot });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICATION_DOSE_VOIDED,
      changedById: actorId,
      changeSummary: `${dose.order.item.name} ${slotText}, ${MEDICATION_DOSE_RESULT_LABELS[dose.result].toLowerCase()}, was voided. Reason: ${trimmedReason}`,
    },
  });

  return { doseId, animalId };
}
