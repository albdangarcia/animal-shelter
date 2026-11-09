"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { RequirePermission, withAuthenticatedUser, type SessionUser } from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { DoseSlotSchema, MedicationDoseFormSchema, type DoseSlotInput, type MedicationDoseFormInput } from "../zod-schemas/medication.schemas";
import { FosterTreatmentSchema, type FosterTreatmentInput } from "../zod-schemas/foster-care.schemas";
import { recordMedicationDose } from "../services/medication-dose";
import { recordFosterTreatment as recordTreatment } from "../services/foster-care";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { ConflictError, NotFoundError, PreconditionFailedError } from "../utils/errors";
import { getShelterNow, getShelterSettings } from "../data/shelter-settings.data";
import { shelterInstant } from "../utils/shelter-day";
import { fieldErrorsByPath } from "../utils/form-result-utils";
import type { FieldErrors, FormResult } from "../action-result";

const refused = <T>(error: unknown): FormResult<T> | null => {
  if (error instanceof MedicalEntryRefusal && error.field) {
    const field = error.field === "administeredAt" ? "givenTime" : error.field;
    return { ok: false, message: error.message, fieldErrors: { [field]: [error.message] } as FieldErrors<T> };
  }
  if (error instanceof ConflictError || error instanceof NotFoundError || error instanceof PreconditionFailedError) {
    return { ok: false, message: error.message };
  }
  return null;
};

const revalidateFosterCare = (animalId: string, treatment = false) => {
  const path = `/dashboard/animals/${animalId}`;
  revalidatePath(`/medical-outputs/animals/${animalId}/history`);
  revalidatePath(path);
  revalidatePath(`${path}/medical`);
  revalidatePath(`${path}/medical/history`);
  revalidatePath(`${path}/medical/medications`);
  revalidatePath("/dashboard/medical/doses");
  revalidatePath("/dashboard/my-foster-animals");
  revalidatePath(`/dashboard/my-foster-animals/${animalId}`);
  if (treatment) {
    revalidatePath(`${path}/medical/vaccines-tests`);
    revalidatePath(`${path}/medical/conditions`);
    revalidatePath(`${path}/medical/documents`);
    revalidatePath(`${path}/medical/vitals`);
    revalidatePath("/pets");
    revalidatePath("/pets/favorites");
    revalidatePath(`/pets/${animalId}`);
    revalidatePath("/dashboard/medical/due");
  }
};

const _recordFosterDose = async (
  user: SessionUser, orderId: string, slotInput: DoseSlotInput, values: MedicationDoseFormInput,
): Promise<FormResult<MedicationDoseFormInput>> => {
  const id = cuidSchema.safeParse(orderId);
  const slot = DoseSlotSchema.safeParse(slotInput);
  if (!id.success || !slot.success) return { ok: false, message: "Invalid dose: the order or its slot isn't recognised." };
  const parsed = MedicationDoseFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Missing or invalid fields. The dose was not recorded.", fieldErrors: fieldErrorsByPath(parsed.error.issues) };
  const { givenDate, givenTime, ...dose } = parsed.data;
  const [{ today, now }, { timezone }] = await Promise.all([getShelterNow(), getShelterSettings()]);
  let animalId: string;
  try {
    const administeredAt = givenDate && givenTime ? shelterInstant(givenDate, givenTime, timezone) : null;
    ({ animalId } = await prisma.$transaction((tx) => recordMedicationDose(tx, {
      orderId: id.data, slot: slot.data.slot,
      slotDate: slot.data.slot === null && givenDate ? givenDate : slot.data.slotDate,
      administeredAt, ...dose,
    }, user.personId, today, now, { foster: { personId: user.personId } })));
  } catch (error) {
    const refusal = refused<MedicationDoseFormInput>(error);
    if (refusal) return refusal;
    console.error("Error recording foster dose:", error);
    return { ok: false, message: "Failed to record the dose. Please try again." };
  }
  revalidateFosterCare(animalId);
  return { ok: true, message: `Dose recorded as ${dose.result === "GIVEN" ? "given" : dose.result === "REFUSED" ? "refused" : "not given"}.` };
};

const _recordFosterTreatment = async (
  user: SessionUser, entryId: string, values: FosterTreatmentInput,
): Promise<FormResult<FosterTreatmentInput>> => {
  const id = cuidSchema.safeParse(entryId);
  if (!id.success) return { ok: false, message: "Invalid medical entry ID format." };
  const parsed = FosterTreatmentSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Missing or invalid fields. The treatment was not recorded.", fieldErrors: fieldErrorsByPath(parsed.error.issues) };
  const { today } = await getShelterNow();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) => recordTreatment(tx, id.data, parsed.data, user.personId, today)));
  } catch (error) {
    const refusal = refused<FosterTreatmentInput>(error);
    if (refusal) return refusal;
    console.error("Error recording foster treatment:", error);
    return { ok: false, message: "Failed to record the treatment. Please try again." };
  }
  revalidateFosterCare(animalId, true);
  return { ok: true, message: "Treatment recorded as given." };
};

export const recordFosterDose = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_ANIMALS_CARE)(_recordFosterDose),
);

export const recordFosterTreatment = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_ANIMALS_CARE)(_recordFosterTreatment),
);
