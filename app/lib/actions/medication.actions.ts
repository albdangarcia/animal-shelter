"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  DiscontinueMedicationOrderSchema,
  DoseSlotSchema,
  MedicationDoseFormSchema,
  MedicationDosesGivenSchema,
  MedicationOrderCorrectionSchema,
  MedicationOrderFormSchema,
  VoidMedicationDoseSchema,
  VoidMedicationOrderSchema,
  type DiscontinueMedicationOrderInput,
  type DoseSlotInput,
  type MedicationDoseFormInput,
  type MedicationDosesGivenInput,
  type MedicationOrderCorrectionInput,
  type MedicationOrderFormInput,
  type VoidMedicationDoseInput,
  type VoidMedicationOrderInput,
} from "../zod-schemas/medication.schemas";
import {
  createMedicationOrder as createOrder,
  discontinueMedicationOrder as discontinueOrder,
  editMedicationOrder as editOrder,
  voidMedicationOrder as voidOrder,
} from "../services/medication-order";
import {
  recordMedicationDose as recordDose,
  recordMedicationDosesGiven as recordDosesGiven,
  voidMedicationDose as voidDose,
  type MedicationBatchSlotRefusal,
} from "../services/medication-dose";
import { MedicalBatchRefusal } from "../services/medical-batch";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import { getShelterNow, getShelterSettings } from "../data/shelter-settings.data";
import { fieldErrorsByPath } from "../utils/form-result-utils";
import { shelterInstant } from "../utils/shelter-day";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type {
  ActionFailure,
  ActionSuccess,
  FieldErrors,
  FormResult,
} from "@/app/lib/action-result";

// The animal's page (its activity feed), the Medical pages that show orders
// and doses (Overview's today's doses, Medications, History), and the
// shelter's dose sheet. They render per request (each reads the session),
// but a server action re-renders the page it was called from only for a path
// it revalidates, so each is named.
const revalidateMedication = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(`/medical-outputs/animals/${animalId}/history`);
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/medications`);
  revalidatePath(`${animalPath}/medical/history`);
  revalidatePath("/dashboard/medical/doses");
};

/**
 * A refusal from the service, keyed to its form field when it has one. The
 * service names the instant a dose was given `administeredAt`; the dose form
 * enters it as a day and a time, and the time is where its refusal shows.
 */
const refused = <TValues>(error: unknown): FormResult<TValues> | null => {
  if (error instanceof MedicalEntryRefusal && error.field) {
    const field = error.field === "administeredAt" ? "givenTime" : error.field;
    return {
      ok: false,
      message: error.message,
      fieldErrors: { [field]: [error.message] } as FieldErrors<TValues>,
    };
  }
  if (
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof PreconditionFailedError
  ) {
    return { ok: false, message: error.message };
  }
  return null;
};

const invalidFields = <TValues>(
  error: z.ZodError,
  message: string,
): FormResult<TValues> => ({
  ok: false,
  message,
  fieldErrors: fieldErrorsByPath<TValues>(error.issues),
});

const parseId = (id: string) => {
  const parsed = cuidSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
};

const _createMedicationOrder = async (
  user: SessionUser,
  animalId: string,
  values: MedicationOrderFormInput,
): Promise<FormResult<MedicationOrderFormInput>> => {
  const parsedAnimalId = parseId(animalId);
  if (!parsedAnimalId) return { ok: false, message: "Invalid animal ID format." };
  const validated = MedicationOrderFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "Missing or invalid fields. The medication was not ordered.",
    );
  }

  const { today } = await getShelterNow();
  try {
    await prisma.$transaction((tx) =>
      createOrder(
        tx,
        { ...validated.data, animalId: parsedAnimalId },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<MedicationOrderFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error ordering a medication:", error);
    return { ok: false, message: "Database Error: Failed to order the medication." };
  }

  revalidateMedication(parsedAnimalId);
  return { ok: true, message: "Medication ordered." };
};

const _editMedicationOrder = async (
  user: SessionUser,
  orderId: string,
  values: MedicationOrderCorrectionInput,
): Promise<FormResult<MedicationOrderCorrectionInput>> => {
  const parsedId = parseId(orderId);
  if (!parsedId) return { ok: false, message: "Invalid medication order ID format." };
  const validated = MedicationOrderCorrectionSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "Missing or invalid fields. The order was not saved.",
    );
  }
  // The frequency comes along to check the first slot; it never changes.
  const { frequency: _frequency, ...correction } = validated.data;

  const { today } = await getShelterNow();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editOrder(tx, parsedId, correction, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    const refusal = refused<MedicationOrderCorrectionInput>(error);
    if (refusal) return refusal;
    console.error("Database error editing a medication order:", error);
    return { ok: false, message: "Database Error: Failed to update the order." };
  }

  revalidateMedication(animalId);
  return { ok: true, message: "Order updated." };
};

const _discontinueMedicationOrder = async (
  user: SessionUser,
  orderId: string,
  values: DiscontinueMedicationOrderInput,
): Promise<FormResult<DiscontinueMedicationOrderInput>> => {
  const parsedId = parseId(orderId);
  if (!parsedId) return { ok: false, message: "Invalid medication order ID format." };
  const validated = DiscontinueMedicationOrderSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "Missing or invalid fields. The order was not discontinued.",
    );
  }

  const { today } = await getShelterNow();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      discontinueOrder(tx, parsedId, validated.data, user.personId, today),
    ));
  } catch (error) {
    const refusal = refused<DiscontinueMedicationOrderInput>(error);
    if (refusal) return refusal;
    console.error("Database error discontinuing a medication order:", error);
    return { ok: false, message: "Database Error: Failed to discontinue the order." };
  }

  revalidateMedication(animalId);
  return { ok: true, message: "Order discontinued." };
};

const _voidMedicationOrder = async (
  user: SessionUser,
  orderId: string,
  values: VoidMedicationOrderInput,
): Promise<FormResult<VoidMedicationOrderInput>> => {
  const parsedId = parseId(orderId);
  if (!parsedId) return { ok: false, message: "Invalid medication order ID format." };
  const validated = VoidMedicationOrderSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "A reason is required to void this order.");
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidOrder(tx, parsedId, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicationOrderInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding a medication order:", error);
    return { ok: false, message: "Database Error: Failed to void the order." };
  }

  revalidateMedication(animalId);
  return { ok: true, message: "Order voided." };
};

/**
 * Records one dose. Give sends the result alone, and the dose is given now.
 * With its details, the day and time are read on the shelter's clock; an
 * as-needed dose's day is the day it was given, since it has no slot.
 */
const _recordMedicationDose = async (
  user: SessionUser,
  orderId: string,
  slotInput: DoseSlotInput,
  values: MedicationDoseFormInput,
): Promise<FormResult<MedicationDoseFormInput>> => {
  const parsedId = parseId(orderId);
  const slot = DoseSlotSchema.safeParse(slotInput);
  if (!parsedId || !slot.success) {
    return { ok: false, message: "Invalid dose: the order or its slot isn't recognised." };
  }
  const validated = MedicationDoseFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "Missing or invalid fields. The dose was not recorded.");
  }
  const { givenDate, givenTime, ...dose } = validated.data;

  // One reading of the time: today for the slot rules, now for "given now".
  const [{ today, now }, { timezone }] = await Promise.all([
    getShelterNow(),
    getShelterSettings(),
  ]);
  const administeredAt =
    givenDate && givenTime ? shelterInstant(givenDate, givenTime, timezone) : null;
  const slotDate = slot.data.slot === null && givenDate ? givenDate : slot.data.slotDate;
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      recordDose(
        tx,
        { orderId: parsedId, slotDate, slot: slot.data.slot, administeredAt, ...dose },
        user.personId,
        today,
        now,
      ),
    ));
  } catch (error) {
    const refusal = refused<MedicationDoseFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording a dose:", error);
    return { ok: false, message: "Database Error: Failed to record the dose." };
  }

  revalidateMedication(animalId);
  return {
    ok: true,
    message:
      dose.result === "GIVEN"
        ? "Dose recorded as given."
        : dose.result === "REFUSED"
          ? "Dose recorded as refused."
          : "Dose recorded as not given.",
  };
};

/**
 * What recording several doses returns: how many were written, or, when any
 * slot was refused, each refused slot and why. Nothing is written then.
 */
export type MedicationDosesGivenResult =
  | ActionSuccess<{ written: number }>
  | (ActionFailure<never> & { refusals?: MedicationBatchSlotRefusal[] });

// Up to 50 doses, each behind its animal's lock, can pass the default five
// seconds against a remote database, as the entry batches can.
const BATCH_TRANSACTION = { timeout: 30_000 };

/** Records several slots as given now, from the dose sheet: all or nothing. */
const _recordMedicationDosesGiven = async (
  user: SessionUser,
  slots: MedicationDosesGivenInput,
): Promise<MedicationDosesGivenResult> => {
  const validated = MedicationDosesGivenSchema.safeParse(slots);
  if (!validated.success) {
    return {
      ok: false,
      message: validated.error.issues[0]?.message ?? "The doses picked aren't valid.",
    };
  }

  const { today, now } = await getShelterNow();
  let doses: { animalId: string }[];
  try {
    ({ doses } = await prisma.$transaction(
      (tx) => recordDosesGiven(tx, validated.data, user.personId, today, now),
      BATCH_TRANSACTION,
    ));
  } catch (error) {
    if (error instanceof MedicalBatchRefusal) {
      return {
        ok: false,
        message: error.message,
        refusals: error.refusals as MedicationBatchSlotRefusal[],
      };
    }
    const refusal = refused<never>(error);
    if (refusal) return refusal;
    console.error("Database error recording doses:", error);
    return { ok: false, message: "Database Error: Failed to record the doses." };
  }

  for (const animalId of new Set(doses.map((dose) => dose.animalId))) {
    revalidateMedication(animalId);
  }
  return {
    ok: true,
    message: `Recorded ${doses.length === 1 ? "1 dose" : `${doses.length} doses`} as given.`,
    data: { written: doses.length },
  };
};

const _voidMedicationDose = async (
  user: SessionUser,
  doseId: string,
  values: VoidMedicationDoseInput,
): Promise<FormResult<VoidMedicationDoseInput>> => {
  const parsedId = parseId(doseId);
  if (!parsedId) return { ok: false, message: "Invalid dose ID format." };
  const validated = VoidMedicationDoseSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "A reason is required to void this dose.");
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidDose(tx, parsedId, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicationDoseInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding a dose:", error);
    return { ok: false, message: "Database Error: Failed to void the dose." };
  }

  revalidateMedication(animalId);
  return { ok: true, message: "Dose voided." };
};

export const createMedicationOrder = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_createMedicationOrder),
);

export const editMedicationOrder = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editMedicationOrder),
);

export const discontinueMedicationOrder = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_discontinueMedicationOrder),
);

export const voidMedicationOrder = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicationOrder),
);

export const recordMedicationDose = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(_recordMedicationDose),
);

export const recordMedicationDosesGiven = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(_recordMedicationDosesGiven),
);

export const voidMedicationDose = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicationDose),
);
