"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  RequireAllPermissions,
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  MedicalConditionFormSchema,
  VoidMedicalConditionSchema,
  type MedicalConditionFormInput,
  type VoidMedicalConditionInput,
} from "../zod-schemas/medical-condition.schemas";
import {
  addCharacteristicFromCondition as addTraitFromCondition,
  addMedicalCondition as addCondition,
  editMedicalCondition as editCondition,
  voidMedicalCondition as voidCondition,
} from "../services/medical-condition";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import { getShelterToday } from "../data/shelter-settings.data";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type ConditionResult = FormResult<MedicalConditionFormInput>;

// The animal's page (its banner and activity feed), the Medical pages that
// show the problem list, and History. The dashboard home and the readiness
// board render per request (both read the session), so neither has a cached
// copy to refresh.
const revalidateProblemList = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/conditions`);
  revalidatePath(`${animalPath}/medical/history`);
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
  error: z.ZodError<MedicalConditionFormInput>,
): ConditionResult => ({
  ok: false,
  message: "Missing or invalid fields. The condition was not saved.",
  fieldErrors: z.flattenError(error)
    .fieldErrors as FieldErrors<MedicalConditionFormInput>,
});

const _addMedicalCondition = async (
  user: SessionUser,
  animalId: string,
  values: MedicalConditionFormInput,
): Promise<ConditionResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = MedicalConditionFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      addCondition(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<MedicalConditionFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error adding medical condition:", error);
    return { ok: false, message: "Database Error: Failed to add condition." };
  }

  revalidateProblemList(parsedAnimalId.data);
  return { ok: true, message: "Added to the problem list." };
};

const _editMedicalCondition = async (
  user: SessionUser,
  conditionId: string,
  values: MedicalConditionFormInput,
): Promise<ConditionResult> => {
  const parsedId = cuidSchema.safeParse(conditionId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid condition ID format." };
  }
  const validated = MedicalConditionFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editCondition(tx, parsedId.data, validated.data, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    const refusal = refused<MedicalConditionFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error editing medical condition:", error);
    return { ok: false, message: "Database Error: Failed to update condition." };
  }

  revalidateProblemList(animalId);
  return { ok: true, message: "Condition updated." };
};

const _voidMedicalCondition = async (
  user: SessionUser,
  conditionId: string,
  values: VoidMedicalConditionInput,
): Promise<FormResult<VoidMedicalConditionInput>> => {
  const parsedId = cuidSchema.safeParse(conditionId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid condition ID format." };
  }
  const validated = VoidMedicalConditionSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to void this condition.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<VoidMedicalConditionInput>,
    };
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidCondition(tx, parsedId.data, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicalConditionInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding medical condition:", error);
    return { ok: false, message: "Database Error: Failed to void condition." };
  }

  revalidateProblemList(animalId);
  return { ok: true, message: "Condition voided." };
};

const _addCharacteristicFromCondition = async (
  user: SessionUser,
  conditionId: string,
): Promise<FormResult<Record<string, never>>> => {
  const parsedId = cuidSchema.safeParse(conditionId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid condition ID format." };
  }
  const located = await prisma.medicalCondition.findUnique({
    where: { id: parsedId.data },
    select: { animalId: true },
  });
  if (!located) {
    return { ok: false, message: "Condition not found." };
  }

  let message: string;
  try {
    ({ message } = await prisma.$transaction((tx) =>
      addTraitFromCondition(
        tx,
        { animalId: located.animalId, conditionId: parsedId.data },
        user.personId,
        new Date(),
      ),
    ));
  } catch (error) {
    const refusal = refused<Record<string, never>>(error);
    if (refusal) return refusal;
    console.error("Database error adding a trait from a condition:", error);
    return { ok: false, message: "Database Error: Failed to add the trait." };
  }

  revalidateProblemList(located.animalId);
  const animalPath = `/dashboard/animals/${located.animalId}`;
  revalidatePath(`${animalPath}/characteristics`);
  // What each assessment's page suggests depends on the animal's traits, and
  // the public profile lists them.
  revalidatePath(`${animalPath}/assessments`);
  revalidatePath("/dashboard/animals/[id]/assessments/[assessmentId]", "page");
  revalidatePath(`/pets/${located.animalId}`);
  return { ok: true, message };
};

export const addMedicalCondition = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_addMedicalCondition),
);

// Resolving a condition and making it active again are corrections.
export const editMedicalCondition = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editMedicalCondition),
);

export const voidMedicalCondition = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicalCondition),
);

// Puts a trait on the animal, so it needs the characteristics permission as
// well as the medical one.
export const addCharacteristicFromCondition = withAuthenticatedUser(
  RequireAllPermissions(
    AppPermissions.MEDICAL_MANAGE,
    AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE,
  )(_addCharacteristicFromCondition),
);
