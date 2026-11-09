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
  CareEpisodeFormSchema,
  CloseCareEpisodeSchema,
  VoidCareEpisodeSchema,
  type CareEpisodeFormInput,
  type CloseCareEpisodeInput,
  type VoidCareEpisodeInput,
} from "../zod-schemas/care-episode.schemas";
import {
  closeCareEpisode as closeEpisode,
  editCareEpisode as editEpisode,
  openCareEpisode as openEpisode,
  voidCareEpisode as voidEpisode,
} from "../services/care-episode";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import { getShelterToday } from "../data/shelter-settings.data";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type EpisodeResult = FormResult<CareEpisodeFormInput>;

// The animal's page (its banner and activity feed), the Medical pages that
// show care episodes, and History. The dashboard home and the readiness
// board render per request (both read the session), so neither has a cached
// copy to refresh.
const revalidateCareEpisodes = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(`/medical-outputs/animals/${animalId}/history`);
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

const invalidFields = <TValues>(
  error: z.ZodError,
  message: string,
): FormResult<TValues> => ({
  ok: false,
  message,
  fieldErrors: z.flattenError(error).fieldErrors as FieldErrors<TValues>,
});

const _openCareEpisode = async (
  user: SessionUser,
  animalId: string,
  values: CareEpisodeFormInput,
): Promise<EpisodeResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = CareEpisodeFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "Missing or invalid fields. The care episode was not opened.",
    );
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      openEpisode(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<CareEpisodeFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error opening care episode:", error);
    return { ok: false, message: "Database Error: Failed to open care episode." };
  }

  revalidateCareEpisodes(parsedAnimalId.data);
  return {
    ok: true,
    message: validated.data.endDate ? "Care episode recorded." : "Care episode opened.",
  };
};

const _closeCareEpisode = async (
  user: SessionUser,
  episodeId: string,
  values: CloseCareEpisodeInput,
): Promise<FormResult<CloseCareEpisodeInput>> => {
  const parsedId = cuidSchema.safeParse(episodeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid care episode ID format." };
  }
  const validated = CloseCareEpisodeSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "The day it ended is required.");
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      closeEpisode(tx, parsedId.data, validated.data.endDate, user.personId, today),
    ));
  } catch (error) {
    const refusal = refused<CloseCareEpisodeInput>(error);
    if (refusal) return refusal;
    console.error("Database error closing care episode:", error);
    return { ok: false, message: "Database Error: Failed to close care episode." };
  }

  revalidateCareEpisodes(animalId);
  return { ok: true, message: "Care episode closed." };
};

const _editCareEpisode = async (
  user: SessionUser,
  episodeId: string,
  values: CareEpisodeFormInput,
): Promise<EpisodeResult> => {
  const parsedId = cuidSchema.safeParse(episodeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid care episode ID format." };
  }
  const validated = CareEpisodeFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "Missing or invalid fields. The care episode was not saved.",
    );
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editEpisode(tx, parsedId.data, validated.data, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    const refusal = refused<CareEpisodeFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error editing care episode:", error);
    return { ok: false, message: "Database Error: Failed to update care episode." };
  }

  revalidateCareEpisodes(animalId);
  return { ok: true, message: "Care episode updated." };
};

const _voidCareEpisode = async (
  user: SessionUser,
  episodeId: string,
  values: VoidCareEpisodeInput,
): Promise<FormResult<VoidCareEpisodeInput>> => {
  const parsedId = cuidSchema.safeParse(episodeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid care episode ID format." };
  }
  const validated = VoidCareEpisodeSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(
      validated.error,
      "A reason is required to void this care episode.",
    );
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidEpisode(tx, parsedId.data, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidCareEpisodeInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding care episode:", error);
    return { ok: false, message: "Database Error: Failed to void care episode." };
  }

  revalidateCareEpisodes(animalId);
  return { ok: true, message: "Care episode voided." };
};

export const openCareEpisode = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_openCareEpisode),
);

export const closeCareEpisode = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_closeCareEpisode),
);

export const editCareEpisode = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editCareEpisode),
);

export const voidCareEpisode = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidCareEpisode),
);
