import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  MedicalDocumentEventAction,
  MedicalDocumentType,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_NAME_MAX_LENGTH } from "@/app/lib/constants/medical";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  DOCUMENT_SNIFF_BYTES,
  MEDICAL_DOCUMENT_CONTENT_TYPES,
  documentDayIssue,
  documentFileIssue,
  sniffDocumentType,
  type MedicalDocumentContentType,
} from "@/app/lib/utils/medical-document-file";
import type { MedicalDocumentStore } from "@/app/lib/storage/medical-document-store";
import { checkFostering } from "@/app/lib/data/fosters/foster-access";
import { MedicalEntryRefusal, tidy } from "@/app/lib/services/medical-entry-values";
import { readAnimal } from "@/app/lib/services/medical-entry";
import {
  dayText,
  describeProseChange,
  describeValueChange,
} from "@/app/lib/services/medical-entry-text";
import {
  documentAddedText,
  documentEditedText,
  documentEntryText,
  documentFileRemovedText,
  documentTypeText,
  documentVoidedText,
  type DocumentEntryLine,
} from "@/app/lib/services/medical-document-text";

/**
 * An animal's medical documents: lab results, vet records, imaging,
 * prescriptions and consent forms, kept on its record as files.
 *
 * A document belongs to the animal, and may belong to one of its entries (a
 * test's lab report, a surgery's discharge sheet). Paperwork a foster sends
 * with a report of an outside vet visit names that report too. Its file is
 * private: the row holds the store's key, never a URL, and the file reaches a
 * browser only through a route that checks who is asking. The file is kept
 * exactly as sent.
 *
 * A document is corrected in place, each change written as an event and a
 * line in the animal's activity feed. A void is written once and never
 * undone: the row and the file stay, and the document counts for nothing.
 * Removing the file is for a voided document whose file the shelter should
 * never have held (the wrong animal, someone's private data): the file is
 * deleted from the store, and the row stays, saying who removed it, when and
 * why. That too is written once.
 *
 * Every write takes the animal's lock first. Like the entry service, this
 * module has **no `next/*` and no auth imports**, so the seed and the database
 * tests can drive it; whoever calls it has checked who may. It runs inside the
 * caller's `prisma.$transaction`, and takes the shelter's today as an
 * argument. The file is stored before the transaction starts
 * (`storeThenRecord`), since a store isn't part of it.
 */

/** A document as a form or a caller gives it, apart from its file. */
export interface MedicalDocumentInput {
  animalId: string;
  name: string;
  type: MedicalDocumentType;
  /** The day on the paper, when it has one. */
  documentDate?: CalendarDay | null;
  notes?: string | null;
  /** An entry of the same animal, given or scheduled, that it belongs to. */
  entryId?: string | null;
  /** The waiting foster's report it was sent with. */
  vetReportId?: string | null;
}

/** The file a document holds, once it is in the store. */
export interface StoredDocumentFile {
  pathname: string;
  /** Read from the file's first bytes. */
  contentType: MedicalDocumentContentType;
  sizeBytes: number;
}

/** A correction. A field left out keeps what is stored, and `null` clears it. */
export type MedicalDocumentCorrection = Partial<{
  name: string;
  type: MedicalDocumentType;
  documentDate: CalendarDay | null;
  notes: string | null;
  entryId: string | null;
}>;

/** Why a foster's upload can't name an entry. The upload route refuses it
 * before storing the file, with these words. */
export const FOSTER_ENTRY_REFUSAL =
  "A foster's paperwork goes with their report, not with an entry.";

export interface DocumentWriteOptions {
  /**
   * The upload comes from a foster, not staff: the person must foster the
   * animal now, and the paperwork goes with a waiting report of theirs, never
   * on an entry.
   */
  foster?: { personId: string };
}

export type MedicalDocumentEdit =
  | { status: "edited"; documentId: string; animalId: string; changeSummary: string }
  | { status: "unchanged"; documentId: string; animalId: string };

/** What a correction can change, flat and keyed by field name, as its events
 * record it. */
interface DocumentValues {
  name: string;
  type: MedicalDocumentType;
  documentDate: CalendarDay | null;
  notes: string | null;
  entryId: string | null;
}

type DocumentField = keyof DocumentValues;

// In the order a correction's text lists them.
const FIELDS: DocumentField[] = ["name", "type", "documentDate", "entryId", "notes"];

const asJson = (value: object) => value as Prisma.InputJsonObject;

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/**
 * The content type of a file that can be a document, read from its first
 * bytes. Refuses, on `file`, anything else: no file, one over 4 MB, an HEIC
 * photo, or a type the shelter doesn't keep.
 */
export const checkDocumentFile = (bytes: Uint8Array): MedicalDocumentContentType => {
  const sniffed = sniffDocumentType(bytes.subarray(0, DOCUMENT_SNIFF_BYTES));
  const issue = documentFileIssue({ size: bytes.byteLength, sniffed });
  if (issue || sniffed === null || sniffed === "heic") {
    throw new MedicalEntryRefusal(
      issue ?? "Upload a PDF, JPEG, PNG or WebP file.",
      "file",
    );
  }
  return sniffed;
};

/**
 * Stores a document's file, then runs `write` (the transaction that records
 * it). The file goes first because the store can't take part in the
 * transaction: if anything after the store fails or is refused, the file is
 * removed again and the error is passed on. That removal is best effort; a
 * failed one is logged, and the file is left with no row pointing at it.
 *
 * A store that fails may still have written the file (its answer lost on
 * the way back), so a failed store is followed by a removal too, but only
 * at a `fresh` pathname, one no file could hold before this call (an
 * upload's `newDocumentPathname`). At a fixed pathname (the seed's), a
 * refused store may have left the file already there, which isn't this
 * call's to remove.
 *
 * The file is checked before it is stored.
 */
export async function storeThenRecord<T>(
  store: MedicalDocumentStore,
  file: { pathname: string; bytes: Uint8Array; fresh: boolean },
  write: (stored: StoredDocumentFile) => Promise<T>,
): Promise<T> {
  const contentType = checkDocumentFile(file.bytes);
  const removeStored = async (after: string) => {
    try {
      await store.remove(file.pathname);
    } catch (removeError) {
      console.error(
        `Failed to remove a medical document's file after ${after} (${file.pathname}):`,
        removeError,
      );
    }
  };

  try {
    await store.put(file.pathname, file.bytes, contentType);
  } catch (error) {
    if (file.fresh) await removeStored("its store failed");
    throw error;
  }
  try {
    return await write({
      pathname: file.pathname,
      contentType,
      sizeBytes: file.bytes.byteLength,
    });
  } catch (error) {
    await removeStored("its row wasn't written");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

const checkName = (name: string) => {
  if (!name) {
    throw new MedicalEntryRefusal("Give the document a name.", "name");
  }
  if (name.length > MEDICAL_DOCUMENT_NAME_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The name can't be longer than ${MEDICAL_DOCUMENT_NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }
};

const checkType = (type: MedicalDocumentType) => {
  if (!Object.values(MedicalDocumentType).includes(type)) {
    throw new MedicalEntryRefusal("Pick the document type.", "type");
  }
};

/** The paper's day: neither before the animal was born nor after today. */
const checkDay = (
  documentDate: CalendarDay | null,
  birthDate: CalendarDay,
  today: CalendarDay,
) => {
  if (!documentDate) return;
  const issue = documentDayIssue(documentDate, birthDate, today);
  if (issue) {
    throw new MedicalEntryRefusal(issue, "documentDate");
  }
};

/** What the stored file is said to be, checked again: the caller read it. */
const checkStoredFile = ({ pathname, contentType, sizeBytes }: StoredDocumentFile) => {
  const sniffed = MEDICAL_DOCUMENT_CONTENT_TYPES.includes(contentType) ? contentType : null;
  const issue = documentFileIssue({ size: sizeBytes, sniffed });
  if (issue) {
    throw new MedicalEntryRefusal(issue, "file");
  }
  if (!pathname) {
    throw new Error("A medical document's file has no pathname.");
  }
};

const ENTRY_LINE_SELECT = {
  animalId: true,
  kind: true,
  status: true,
  completedDate: true,
  dueDate: true,
  procedure: true,
  examType: true,
  chipNumber: true,
  voidedAt: true,
  item: { select: { name: true } },
} as const;

const readEntryLine = (tx: TransactionClient, entryId: string) =>
  tx.medicalEntry.findUnique({ where: { id: entryId }, select: ENTRY_LINE_SELECT });

/**
 * The entry a document is linked to: one of the same animal's, given or
 * scheduled, and not voided. Declined care was never given, so it has no
 * paperwork.
 */
const checkEntry = async (
  tx: TransactionClient,
  animalId: string,
  entryId: string,
): Promise<DocumentEntryLine> => {
  const entry = await readEntryLine(tx, entryId);
  if (!entry || entry.animalId !== animalId) {
    throw new MedicalEntryRefusal("Pick an entry from this animal's record.", "entryId");
  }
  if (entry.voidedAt) {
    throw new MedicalEntryRefusal(
      "That entry was voided, so no document can be linked to it.",
      "entryId",
    );
  }
  if (entry.status === MedicalEntryStatus.DECLINED) {
    throw new MedicalEntryRefusal(
      "That care was declined, so no document can be linked to it.",
      "entryId",
    );
  }
  return entry;
};

/**
 * The foster's report a document is sent with: one of the same animal's,
 * still waiting for review, and, from a foster, their own.
 */
const checkReport = async (
  tx: TransactionClient,
  animalId: string,
  reportId: string,
  foster: { personId: string } | undefined,
): Promise<{ visitDate: CalendarDay }> => {
  const report = await tx.vetVisitReport.findUnique({
    where: { id: reportId },
    select: { animalId: true, reportedById: true, reviewedAt: true, visitDate: true },
  });
  if (!report || report.animalId !== animalId) {
    throw new MedicalEntryRefusal("That report isn't one of this animal's.");
  }
  if (foster && report.reportedById !== foster.personId) {
    throw new MedicalEntryRefusal("Paperwork can be added only to your own reports.");
  }
  if (report.reviewedAt) {
    throw new MedicalEntryRefusal(
      "This report was already reviewed, so no paperwork can be added to it.",
    );
  }
  return { visitDate: calendarDay(report.visitDate) };
};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

/**
 * Records a document whose file is already stored. Staff can add paperwork to
 * an animal that has left the shelter's care, since it often arrives late. A
 * foster adds it only to a waiting report of theirs, for an animal they
 * foster now.
 */
export async function createMedicalDocument(
  tx: TransactionClient,
  input: MedicalDocumentInput & StoredDocumentFile,
  actorId: string,
  today: CalendarDay,
  { foster }: DocumentWriteOptions = {},
): Promise<{ documentId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);
  const animal = await readAnimal(tx, animalId);

  const entryId = input.entryId || null;
  const vetReportId = input.vetReportId || null;
  if (foster) {
    await checkFostering(tx, foster.personId, animalId);
    if (!vetReportId) {
      throw new MedicalEntryRefusal(
        "A foster's paperwork goes with their report of an outside vet visit.",
      );
    }
    if (entryId) {
      throw new MedicalEntryRefusal(FOSTER_ENTRY_REFUSAL, "entryId");
    }
  }

  const values: DocumentValues = {
    name: tidy(input.name) ?? "",
    type: input.type,
    documentDate: input.documentDate ?? null,
    notes: tidy(input.notes),
    entryId,
  };
  checkStoredFile(input);
  checkName(values.name);
  checkType(values.type);
  checkDay(values.documentDate, animal.birthDate, today);
  const entry = entryId ? await checkEntry(tx, animalId, entryId) : null;
  const report = vetReportId ? await checkReport(tx, animalId, vetReportId, foster) : null;

  const stored = {
    ...values,
    vetReportId,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  };
  const { id: documentId } = await tx.medicalDocument.create({
    data: { ...stored, animalId, pathname: input.pathname, uploadedById: actorId },
    select: { id: true },
  });
  // The store's key stays on the row: it is never shown, so the event that
  // feeds the change history leaves it out.
  await tx.medicalDocumentEvent.create({
    data: {
      documentId,
      action: MedicalDocumentEventAction.CREATED,
      actorId,
      after: asJson(stored),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_DOCUMENT_ADDED,
      changedById: actorId,
      changeSummary: documentAddedText({
        type: values.type,
        name: values.name,
        entry,
        reportVisitDate: report?.visitDate ?? null,
      }),
    },
  });

  return { documentId, animalId };
}

// A document's animal never changes, so it can be read before the lock.
const locateDocument = async (tx: TransactionClient, documentId: string) => {
  const located = await tx.medicalDocument.findUnique({
    where: { id: documentId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Medical document not found.");
  }
  return located.animalId;
};

const readDocument = (tx: TransactionClient, documentId: string) =>
  tx.medicalDocument.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      name: true,
      type: true,
      documentDate: true,
      notes: true,
      entryId: true,
      pathname: true,
      voidedAt: true,
      fileRemovedAt: true,
    },
  });

type StoredDocument = Awaited<ReturnType<typeof readDocument>>;

const asValues = (row: StoredDocument): DocumentValues => ({
  name: row.name,
  type: row.type,
  documentDate: row.documentDate ? calendarDay(row.documentDate) : null,
  notes: row.notes,
  entryId: row.entryId,
});

/** The values a correction would store: it over what is stored. */
const valuesFor = (
  correction: MedicalDocumentCorrection,
  before: DocumentValues,
): DocumentValues => ({
  name: correction.name === undefined ? before.name : (tidy(correction.name) ?? ""),
  type: correction.type === undefined ? before.type : correction.type,
  documentDate:
    correction.documentDate === undefined ? before.documentDate : correction.documentDate,
  notes: correction.notes === undefined ? before.notes : tidy(correction.notes),
  entryId: correction.entryId === undefined ? before.entryId : correction.entryId || null,
});

const entryText = async (tx: TransactionClient, entryId: string | null) => {
  if (!entryId) return null;
  const entry = await readEntryLine(tx, entryId);
  return entry ? documentEntryText(entry) : null;
};

const describeChange = async (
  tx: TransactionClient,
  field: DocumentField,
  before: DocumentValues,
  after: DocumentValues,
) => {
  switch (field) {
    case "name":
      return describeValueChange("name", `"${before.name}"`, `"${after.name}"`);
    case "type":
      return describeValueChange(
        "type",
        documentTypeText(before.type),
        documentTypeText(after.type),
      );
    case "documentDate":
      return describeValueChange(
        "document date",
        before.documentDate ? dayText(before.documentDate) : null,
        after.documentDate ? dayText(after.documentDate) : null,
      );
    case "entryId":
      return describeValueChange(
        "entry",
        // One after another: a transaction is one connection.
        await entryText(tx, before.entryId),
        await entryText(tx, after.entryId),
      );
    case "notes":
      return describeProseChange("notes", before.notes, after.notes);
  }
};

/**
 * Corrects a document's name, type, day, notes or entry, and writes an EDITED
 * event holding the before and after values of only what changed. A rule runs
 * again only for what changed, so a document keeps a day or an entry that a
 * later change to the animal's record would no longer allow. A correction
 * that changes nothing writes nothing. A voided document isn't corrected.
 */
export async function editMedicalDocument(
  tx: TransactionClient,
  documentId: string,
  correction: MedicalDocumentCorrection,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalDocumentEdit> {
  const animalId = await locateDocument(tx, documentId);
  await lockAnimal(tx, animalId);

  const stored = await readDocument(tx, documentId);
  if (stored.voidedAt) {
    throw new ConflictError("This document was voided, so it can't be corrected.");
  }
  const before = asValues(stored);
  const after = valuesFor(correction, before);
  const changed = FIELDS.filter((field) => after[field] !== before[field]);
  if (changed.length === 0) {
    return { status: "unchanged", documentId, animalId };
  }

  if (changed.includes("name")) checkName(after.name);
  if (changed.includes("type")) checkType(after.type);
  if (changed.includes("documentDate")) {
    const animal = await readAnimal(tx, animalId);
    checkDay(after.documentDate, animal.birthDate, today);
  }
  if (changed.includes("entryId") && after.entryId) {
    await checkEntry(tx, animalId, after.entryId);
  }

  const pick = (values: DocumentValues) =>
    Object.fromEntries(changed.map((field) => [field, values[field]]));
  await tx.medicalDocument.update({
    where: { id: documentId },
    data: pick(after),
  });
  await tx.medicalDocumentEvent.create({
    data: {
      documentId,
      action: MedicalDocumentEventAction.EDITED,
      actorId,
      before: asJson(pick(before)),
      after: asJson(pick(after)),
    },
  });
  const changes: string[] = [];
  for (const field of changed) {
    changes.push(await describeChange(tx, field, before, after));
  }
  const changeSummary = documentEditedText(before.type, before.name, changes);
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_DOCUMENT_EDITED,
      changedById: actorId,
      changeSummary,
    },
  });

  return { status: "edited", documentId, animalId, changeSummary };
}

const requireReason = (reason: string, message: string) => {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new MedicalEntryRefusal(message, "reason");
  }
  return trimmed;
};

/**
 * Voids a document uploaded in error. Write-once: one already voided is
 * refused, and nothing un-voids one. The row and the file stay.
 */
export async function voidMedicalDocument(
  tx: TransactionClient,
  documentId: string,
  reason: string,
  actorId: string,
): Promise<{ documentId: string; animalId: string }> {
  const voidReason = requireReason(reason, "A reason for voiding this document is required.");
  const animalId = await locateDocument(tx, documentId);
  // Taken before the re-read, so two voids of one document at once can't
  // both see it live.
  await lockAnimal(tx, animalId);
  const stored = await readDocument(tx, documentId);
  if (stored.voidedAt) {
    throw new ConflictError(
      "This document has already been voided. A void can't be undone: if it was voided by mistake, upload it again.",
    );
  }

  await tx.medicalDocument.update({
    where: { id: documentId },
    data: { voidedAt: new Date(), voidedById: actorId, voidReason },
  });
  await tx.medicalDocumentEvent.create({
    data: {
      documentId,
      action: MedicalDocumentEventAction.VOIDED,
      actorId,
      after: { voidReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_DOCUMENT_VOIDED,
      changedById: actorId,
      changeSummary: documentVoidedText(stored.type, stored.name, voidReason),
    },
  });

  return { documentId, animalId };
}

/**
 * Deletes a voided document's file from the store and records who removed
 * it, when and why. The row stays. Write-once, and only on a voided document:
 * a live one is voided first.
 *
 * The file is deleted before the row is written. If the row then fails, the
 * row still says the file is held, and the file route answers that it isn't
 * available: better a stale row than a file kept that should be gone.
 */
export async function removeMedicalDocumentFile(
  tx: TransactionClient,
  documentId: string,
  reason: string,
  actorId: string,
  store: MedicalDocumentStore,
): Promise<{ documentId: string; animalId: string }> {
  const fileRemovalReason = requireReason(
    reason,
    "A reason for removing this file is required.",
  );
  const animalId = await locateDocument(tx, documentId);
  await lockAnimal(tx, animalId);
  const stored = await readDocument(tx, documentId);
  if (!stored.voidedAt) {
    throw new ConflictError(
      "Only a voided document's file can be removed. Void the document first.",
    );
  }
  if (stored.fileRemovedAt) {
    throw new ConflictError("This document's file has already been removed.");
  }

  await store.remove(stored.pathname);

  await tx.medicalDocument.update({
    where: { id: documentId },
    data: { fileRemovedAt: new Date(), fileRemovedById: actorId, fileRemovalReason },
  });
  await tx.medicalDocumentEvent.create({
    data: {
      documentId,
      action: MedicalDocumentEventAction.FILE_REMOVED,
      actorId,
      after: { fileRemovalReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_DOCUMENT_FILE_REMOVED,
      changedById: actorId,
      changeSummary: documentFileRemovedText(stored.type, stored.name, fileRemovalReason),
    },
  });

  return { documentId, animalId };
}
