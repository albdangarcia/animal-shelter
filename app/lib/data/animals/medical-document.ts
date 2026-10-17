// The medical document reads, with no auth or `next/*` imports, so database
// tests can call them. `medical-document.data.ts` wraps them behind
// MEDICAL_READ; the file route checks who is asking itself.
//
// A document's file is never read here: only what the row says about it.

import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { MedicalEntryStatus, type MedicalDocumentType } from "@/prisma/generated/enums";
import { documentEntryText } from "@/app/lib/services/medical-document-text";

type Db = TransactionClient | typeof prisma;

/** Everything the Documents page shows about one document. */
export const MEDICAL_DOCUMENT_DISPLAY_SELECT = {
  id: true,
  animalId: true,
  name: true,
  type: true,
  documentDate: true,
  notes: true,
  contentType: true,
  sizeBytes: true,
  // The upload instant.
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  fileRemovedAt: true,
  fileRemovalReason: true,
  entryId: true,
  // Its line: what it is and its day. It may since have been voided.
  entry: {
    select: {
      kind: true,
      status: true,
      completedDate: true,
      dueDate: true,
      procedure: true,
      examType: true,
      chipNumber: true,
      voidedAt: true,
      item: { select: { name: true } },
    },
  },
  vetReportId: true,
  vetReport: { select: { visitDate: true } },
  uploadedBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  fileRemovedBy: { select: { name: true } },
  // Its change history, oldest first.
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  },
} as const satisfies Prisma.MedicalDocumentSelect;

export type MedicalDocumentDisplay = Prisma.MedicalDocumentGetPayload<{
  select: typeof MEDICAL_DOCUMENT_DISPLAY_SELECT;
}> & {
  /** Whether the store still holds the file: false once it was removed. */
  fileHeld: boolean;
};

/**
 * An animal's documents, newest upload first, optionally of some types only
 * (none given, or an empty list, means every type). Voided ones are left out
 * unless asked for: the Documents page shows them struck through, while
 * anything that counts documents doesn't.
 *
 * Root client only: Prisma reads a row's sibling relations at once, which a
 * transaction's one connection can't.
 */
export const findAnimalDocuments = async (
  db: typeof prisma,
  animalId: string,
  { types, includeVoided }: { types?: MedicalDocumentType[]; includeVoided: boolean },
): Promise<MedicalDocumentDisplay[]> => {
  const documents = await db.medicalDocument.findMany({
    where: {
      animalId,
      ...(types?.length ? { type: { in: types } } : {}),
      ...(includeVoided ? {} : { voidedAt: null }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: MEDICAL_DOCUMENT_DISPLAY_SELECT,
  });
  return documents.map((document) => ({
    ...document,
    fileHeld: document.fileRemovedAt === null,
  }));
};

/** What the file route needs to decide whether, and how, to serve a file. */
export interface DocumentForFile {
  animalId: string;
  /** The store's key. */
  pathname: string;
  contentType: string;
  name: string;
  voided: boolean;
  fileRemoved: boolean;
}

export const findDocumentForFile = async (
  db: Db,
  documentId: string,
): Promise<DocumentForFile | null> => {
  const document = await db.medicalDocument.findUnique({
    where: { id: documentId },
    select: {
      animalId: true,
      pathname: true,
      contentType: true,
      name: true,
      voidedAt: true,
      fileRemovedAt: true,
    },
  });
  if (!document) return null;
  return {
    animalId: document.animalId,
    pathname: document.pathname,
    contentType: document.contentType,
    name: document.name,
    voided: document.voidedAt !== null,
    fileRemoved: document.fileRemovedAt !== null,
  };
};

const ENTRY_LINE_SELECT = {
  id: true,
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

/**
 * What the entries named in documents' corrections read as, by id: a
 * correction's event holds the entry's id before and after. An entry since
 * deleted with its animal can't be named, and is left out.
 */
export const findDocumentEventNames = async (
  db: Db,
  documents: Pick<MedicalDocumentDisplay, "events">[],
): Promise<Record<string, string>> => {
  const ids = new Set<string>();
  for (const { events } of documents) {
    for (const event of events) {
      for (const values of [event.before, event.after]) {
        const entryId = (values as { entryId?: unknown } | null)?.entryId;
        if (typeof entryId === "string") ids.add(entryId);
      }
    }
  }
  if (ids.size === 0) return {};
  const entries = await db.medicalEntry.findMany({
    where: { id: { in: [...ids] } },
    select: ENTRY_LINE_SELECT,
  });
  return Object.fromEntries(entries.map((entry) => [entry.id, documentEntryText(entry)]));
};

/** An entry a document can be linked to, as the form offers it. */
export interface DocumentEntryChoice {
  id: string;
  /** "Heartworm antigen test on Jul 23, 2026", "DHPP vaccine due Oct 20, 2026". */
  label: string;
}

/**
 * The entries of an animal a document can be linked to: care given or still
 * scheduled, not voided, as the document service allows. Latest first, by the
 * day given or due; care of an unknown day last.
 */
export const findDocumentEntryChoices = async (
  db: Db,
  animalId: string,
): Promise<DocumentEntryChoice[]> => {
  const entries = await db.medicalEntry.findMany({
    where: {
      animalId,
      voidedAt: null,
      status: { in: [MedicalEntryStatus.COMPLETED, MedicalEntryStatus.SCHEDULED] },
    },
    select: ENTRY_LINE_SELECT,
  });
  const dayOf = (entry: (typeof entries)[number]) =>
    (entry.status === MedicalEntryStatus.SCHEDULED ? entry.dueDate : entry.completedDate) ?? "";
  return entries
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || a.id.localeCompare(b.id))
    .map((entry) => ({ id: entry.id, label: documentEntryText(entry) }));
};
