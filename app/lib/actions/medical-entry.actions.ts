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
  MedicalEntryFormSchema,
  VoidMedicalEntrySchema,
  type MedicalEntryFormInput,
  type VoidMedicalEntryInput,
} from "../zod-schemas/medical-entry.schemas";
import {
  MedicalEntryRefusal,
  editMedicalEntry as editEntry,
  recordMedicalEntry as recordEntry,
  voidMedicalEntry as voidEntry,
} from "../services/medical-entry";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import { getShelterToday } from "../data/shelter-settings.data";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type EntryResult = FormResult<MedicalEntryFormInput>;

// The Medical pages, and the animal's page for its activity feed.
const revalidateMedical = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/history`);
  revalidatePath(`${animalPath}/medical/vaccines-tests`);
};

/** A refusal from the service, keyed to its field when it has one. */
const refused = <TValues>(error: unknown): FormResult<TValues> | null => {
  if (error instanceof MedicalEntryRefusal && error.field) {
    return {
      ok: false,
      message: error.message,
      fieldErrors: { [error.field]: [error.message] } as FieldErrors<TValues>,
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

const invalidFields = (
  error: z.ZodError<MedicalEntryFormInput>,
): EntryResult => ({
  ok: false,
  message: "Missing or invalid fields. The entry was not saved.",
  fieldErrors: z.flattenError(error)
    .fieldErrors as FieldErrors<MedicalEntryFormInput>,
});

const _recordMedicalEntry = async (
  user: SessionUser,
  animalId: string,
  values: MedicalEntryFormInput,
): Promise<EntryResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      recordEntry(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<MedicalEntryFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording medical entry:", error);
    return { ok: false, message: "Database Error: Failed to record entry." };
  }

  revalidateMedical(parsedAnimalId.data);
  return { ok: true, message: "Entry recorded." };
};

const _editMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: MedicalEntryFormInput,
): Promise<EntryResult> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editEntry(tx, parsedId.data, validated.data, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    const refusal = refused<MedicalEntryFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error editing medical entry:", error);
    return { ok: false, message: "Database Error: Failed to update entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry updated." };
};

const _voidMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: VoidMedicalEntryInput,
): Promise<FormResult<VoidMedicalEntryInput>> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = VoidMedicalEntrySchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to void this entry.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<VoidMedicalEntryInput>,
    };
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidEntry(tx, parsedId.data, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicalEntryInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding medical entry:", error);
    return { ok: false, message: "Database Error: Failed to void entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry voided." };
};

export const recordMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_recordMedicalEntry),
);

export const editMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editMedicalEntry),
);

export const voidMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicalEntry),
);
