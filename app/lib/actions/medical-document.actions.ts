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
  MedicalDocumentCorrectionSchema,
  RemoveMedicalDocumentFileSchema,
  VoidMedicalDocumentSchema,
  type MedicalDocumentCorrectionInput,
  type RemoveMedicalDocumentFileInput,
  type VoidMedicalDocumentInput,
} from "../zod-schemas/medical-document.schemas";
import {
  editMedicalDocument as editDocument,
  removeMedicalDocumentFile as removeDocumentFile,
  voidMedicalDocument as voidDocument,
} from "../services/medical-document";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import { medicalDocumentStore } from "../storage/medical-document-store";
import { getShelterToday } from "../data/shelter-settings.data";
import { fieldErrorsByPath } from "../utils/form-result-utils";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// The animal's page for its activity feed, the Documents page, and the
// Medical pages whose entry rows list their documents (Overview, History,
// Vaccines & Tests). They render per request, but an action re-renders the
// page it was called from only for a path it revalidates.
const revalidateDocuments = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/documents`);
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

const parseDocumentId = (documentId: string) => cuidSchema.safeParse(documentId);

const _editMedicalDocument = async (
  user: SessionUser,
  documentId: string,
  values: MedicalDocumentCorrectionInput,
): Promise<FormResult<MedicalDocumentCorrectionInput>> => {
  const parsedId = parseDocumentId(documentId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid document ID format." };
  }
  const validated = MedicalDocumentCorrectionSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. The document was not saved.",
      fieldErrors: fieldErrorsByPath<MedicalDocumentCorrectionInput>(validated.error.issues),
    };
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editDocument(tx, parsedId.data, validated.data, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    const refusal = refused<MedicalDocumentCorrectionInput>(error);
    if (refusal) return refusal;
    console.error("Database error editing a medical document:", error);
    return { ok: false, message: "Database Error: Failed to update the document." };
  }

  revalidateDocuments(animalId);
  return { ok: true, message: "Document updated." };
};

const _voidMedicalDocument = async (
  user: SessionUser,
  documentId: string,
  values: VoidMedicalDocumentInput,
): Promise<FormResult<VoidMedicalDocumentInput>> => {
  const parsedId = parseDocumentId(documentId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid document ID format." };
  }
  const validated = VoidMedicalDocumentSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to void this document.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<VoidMedicalDocumentInput>,
    };
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidDocument(tx, parsedId.data, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicalDocumentInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding a medical document:", error);
    return { ok: false, message: "Database Error: Failed to void the document." };
  }

  revalidateDocuments(animalId);
  return { ok: true, message: "Document voided." };
};

const _removeMedicalDocumentFile = async (
  user: SessionUser,
  documentId: string,
  values: RemoveMedicalDocumentFileInput,
): Promise<FormResult<RemoveMedicalDocumentFileInput>> => {
  const parsedId = parseDocumentId(documentId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid document ID format." };
  }
  const validated = RemoveMedicalDocumentFileSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to remove this file.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<RemoveMedicalDocumentFileInput>,
    };
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      removeDocumentFile(
        tx,
        parsedId.data,
        validated.data.reason,
        user.personId,
        medicalDocumentStore(),
      ),
    ));
  } catch (error) {
    const refusal = refused<RemoveMedicalDocumentFileInput>(error);
    if (refusal) return refusal;
    console.error("Error removing a medical document's file:", error);
    return { ok: false, message: "Failed to remove the file." };
  }

  revalidateDocuments(animalId);
  return { ok: true, message: "File removed." };
};

export const editMedicalDocument = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editMedicalDocument),
);

export const voidMedicalDocument = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicalDocument),
);

// Deletes a file the shelter shouldn't hold, so it is an admin's call.
export const removeMedicalDocumentFile = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_removeMedicalDocumentFile),
);
