// The medical document reads, with no auth or `next/*` imports, so database
// tests can call them. `medical-document.data.ts` wraps them behind
// MEDICAL_READ; the file route checks who is asking itself.
//
// A document's file is never read here: only what the row says about it.

import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { MedicalDocumentType } from "@/prisma/generated/enums";

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
} as const satisfies Prisma.MedicalDocumentSelect;

export type MedicalDocumentDisplay = Prisma.MedicalDocumentGetPayload<{
  select: typeof MEDICAL_DOCUMENT_DISPLAY_SELECT;
}> & {
  /** Whether the store still holds the file: false once it was removed. */
  fileHeld: boolean;
};

/**
 * An animal's documents, newest upload first, optionally of one type. Voided
 * ones are left out unless asked for: the Documents page shows them struck
 * through, while anything that counts documents doesn't.
 *
 * Root client only: Prisma reads a row's sibling relations at once, which a
 * transaction's one connection can't.
 */
export const findAnimalDocuments = async (
  db: typeof prisma,
  animalId: string,
  { type, includeVoided }: { type?: MedicalDocumentType; includeVoided: boolean },
): Promise<MedicalDocumentDisplay[]> => {
  const documents = await db.medicalDocument.findMany({
    where: {
      animalId,
      ...(type ? { type } : {}),
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
