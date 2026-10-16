import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getCachedSession } from "@/app/lib/auth/session";
import { can } from "@/app/lib/auth/can";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getShelterNow } from "@/app/lib/data/shelter-settings.data";
import { MEDICAL_DOCUMENT_MAX_BYTES } from "@/app/lib/constants/medical";
import {
  MedicalDocumentUploadSchema,
  type MedicalDocumentUploadInput,
} from "@/app/lib/zod-schemas/medical-document.schemas";
import {
  FOSTER_ENTRY_REFUSAL,
  createMedicalDocument,
  storeThenRecord,
} from "@/app/lib/services/medical-document";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import {
  medicalDocumentStore,
  newDocumentPathname,
} from "@/app/lib/storage/medical-document-store";
import {
  DOCUMENT_SNIFF_BYTES,
  documentFileIssue,
  sniffDocumentType,
} from "@/app/lib/utils/medical-document-file";
import { fieldErrorsByPath } from "@/app/lib/utils/form-result-utils";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import type { FormResult } from "@/app/lib/action-result";

// The form's fields beside the file, as the form names them.
type UploadValues = MedicalDocumentUploadInput & { file: File };
type UploadResult = FormResult<UploadValues, { documentId: string }>;

const FIELDS = [
  "animalId",
  "name",
  "type",
  "documentDate",
  "notes",
  "entryId",
  "vetReportId",
] as const;

// The largest body an upload can be: the largest file, with room for the
// form's other fields and multipart's boundaries. Checked against the
// request's declared length before the body is read.
const MAX_BODY_BYTES = MEDICAL_DOCUMENT_MAX_BYTES + 64 * 1024;

const answer = (result: UploadResult, status: number) =>
  NextResponse.json(result, { status });

/** A refusal from the service, keyed to its field when it has one. */
const refused = (error: unknown) => {
  if (error instanceof MedicalEntryRefusal) {
    return answer(
      {
        ok: false,
        message: error.message,
        ...(error.field
          ? { fieldErrors: { [error.field]: [error.message] } as Partial<Record<keyof UploadValues, string[]>> }
          : {}),
      },
      400,
    );
  }
  if (error instanceof NotFoundError) return answer({ ok: false, message: error.message }, 404);
  if (error instanceof ConflictError) return answer({ ok: false, message: error.message }, 409);
  if (error instanceof PreconditionFailedError) {
    return answer({ ok: false, message: error.message }, 400);
  }
  return null;
};

/**
 * Uploads one medical document: its file (multipart `file`) and its fields.
 * Files come through this route, not a server action, because an action's
 * body is capped at 1 MB.
 *
 * Staff who manage medical care upload to any animal's record. Anyone else
 * may send paperwork only with a report of an outside vet visit, as the
 * foster of the animal: the service then checks that the placement is open
 * and the report is theirs and waiting.
 *
 * Every check that needs no database row runs before the file is stored: the
 * declared size, who is asking, the fields (a foster's paperwork names no
 * entry), and the file's own bytes (its type is read from them, never from
 * its name or the browser's claim). Then
 * the file is stored and the row written; if the row is refused, the file is
 * removed again.
 *
 * Answers JSON shaped as a form result. The pages showing documents render
 * per request, so nothing is revalidated: the form refreshes the page.
 */
export async function POST(request: Request) {
  const declared = request.headers.get("content-length");
  const length = declared === null ? Number.NaN : Number(declared);
  if (!Number.isSafeInteger(length) || length < 0) {
    return answer({ ok: false, message: "The upload didn't say how large it is." }, 411);
  }
  if (length > MAX_BODY_BYTES) {
    const message = "This file is larger than 4 MB.";
    return answer({ ok: false, message, fieldErrors: { file: [message] } }, 413);
  }

  const session = await getCachedSession();
  if (!session?.user) {
    return answer({ ok: false, message: "You must be signed in to upload a document." }, 401);
  }
  const { role, personId } = session.user;
  if (!personId) {
    return answer(
      { ok: false, message: "Your account is not associated with a person record." },
      403,
    );
  }
  const asStaff = can(role, AppPermissions.MEDICAL_MANAGE);
  const forbidden = () =>
    answer({ ok: false, message: "You don't have permission to upload this document." }, 403);
  if (!asStaff && !can(role, AppPermissions.MY_FOSTER_ANIMALS_CARE)) {
    return forbidden();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return answer({ ok: false, message: "The upload couldn't be read." }, 400);
  }
  const fields = Object.fromEntries(
    FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : undefined];
    }),
  );
  const file = formData.get("file");
  const bytes =
    file instanceof File && file.size <= MEDICAL_DOCUMENT_MAX_BYTES
      ? new Uint8Array(await file.arrayBuffer())
      : null;
  const fileIssue = documentFileIssue({
    size: file instanceof File ? file.size : 0,
    sniffed: bytes ? sniffDocumentType(bytes.subarray(0, DOCUMENT_SNIFF_BYTES)) : null,
  });

  const parsed = MedicalDocumentUploadSchema.safeParse(fields);
  if (!parsed.success || fileIssue || !bytes) {
    return answer(
      {
        ok: false,
        message: "Missing or invalid fields. The document was not uploaded.",
        fieldErrors: {
          ...(parsed.success ? {} : fieldErrorsByPath<UploadValues>(parsed.error.issues)),
          ...(fileIssue ? { file: [fileIssue] } : {}),
        },
      },
      400,
    );
  }
  const values = parsed.data;
  if (!asStaff && !values.vetReportId) {
    return forbidden();
  }
  // Needs no row, so it is refused before the file is stored. The service
  // refuses it too.
  if (!asStaff && values.entryId) {
    return answer(
      {
        ok: false,
        message: FOSTER_ENTRY_REFUSAL,
        fieldErrors: { entryId: [FOSTER_ENTRY_REFUSAL] },
      },
      400,
    );
  }

  const { today } = await getShelterNow();
  try {
    const { documentId } = await storeThenRecord(
      medicalDocumentStore(),
      { pathname: newDocumentPathname(values.animalId), bytes, fresh: true },
      (stored) =>
        prisma.$transaction((tx) =>
          createMedicalDocument(
            tx,
            { ...values, ...stored },
            personId,
            today,
            asStaff ? {} : { foster: { personId } },
          ),
        ),
    );
    return answer({ ok: true, message: "Document uploaded.", data: { documentId } }, 201);
  } catch (error) {
    const refusal = refused(error);
    if (refusal) return refusal;
    console.error("Failed to upload a medical document:", error);
    return answer({ ok: false, message: "Failed to upload the document." }, 500);
  }
}
