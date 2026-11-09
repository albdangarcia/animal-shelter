import { MedicalDocumentType, MedicalEntryStatus } from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_TYPE_LABELS } from "@/app/lib/constants/medical";
import type { NameableMedicalEntry } from "@/app/lib/utils/medical-entry-name";
import { dayText, joinList, subjectText } from "@/app/lib/services/medical-entry-text";

/**
 * The activity text the document service writes: what a document is called,
 * and how adding, correcting, voiding one and removing its file read in the
 * animal's activity feed. Each line is written once, when the change is made,
 * and never rewritten.
 *
 * It reads nothing: the service passes in what each line names. Like the
 * service, it has no auth and no `next/*` imports.
 */

/** "Lab result", or "Document" for a paper of no listed type. */
const typeNoun = (type: MedicalDocumentType) =>
  type === MedicalDocumentType.OTHER ? "Document" : MEDICAL_DOCUMENT_TYPE_LABELS[type];

/** What the feed calls a document: `Lab result "Heartworm antigen panel"`. */
export const documentTitle = (type: MedicalDocumentType, name: string) =>
  `${typeNoun(type)} "${name}"`;

/** What a document type reads as inside a sentence: "lab result". */
export const documentTypeText = (type: MedicalDocumentType) =>
  MEDICAL_DOCUMENT_TYPE_LABELS[type].toLowerCase();

/** An entry a document can belong to, as the text names it. */
export type DocumentEntryLine = NameableMedicalEntry & {
  status: MedicalEntryStatus;
  completedDate: string | null;
  dueDate: string | null;
  chipNumber?: string | null;
};

/**
 * The entry a document belongs to: "Heartworm test on Oct 12, 2026" for care
 * given, "DHPP vaccine due Oct 20, 2026" for care still scheduled.
 */
export const documentEntryText = (entry: DocumentEntryLine) =>
  entry.status === MedicalEntryStatus.SCHEDULED
    ? `${subjectText(entry)} due ${dayText(entry.dueDate)}`
    : `${subjectText(entry)} on ${dayText(entry.completedDate)}`;

/**
 * `Lab result "Heartworm antigen panel" added for Heartworm test on Oct 12,
 * 2026.`, or `… added to a foster's report of the visit on Oct 14, 2026.` for
 * paperwork sent with a report.
 */
export const documentAddedText = ({
  type,
  name,
  entry,
  reportVisitDate,
}: {
  type: MedicalDocumentType;
  name: string;
  entry: DocumentEntryLine | null;
  reportVisitDate: string | null;
}) => {
  const belongsTo = [
    ...(entry ? [`for ${documentEntryText(entry)}`] : []),
    ...(reportVisitDate
      ? [`to a foster's report of the visit on ${dayText(reportVisitDate)}`]
      : []),
  ];
  return `${documentTitle(type, name)} added${belongsTo.length ? ` ${belongsTo.join(" and ")}` : ""}.`;
};

/** `Lab result "…" was corrected: the name changed from … and notes were added.` */
export const documentEditedText = (
  type: MedicalDocumentType,
  name: string,
  changes: string[],
) => `${documentTitle(type, name)} was corrected: ${joinList(changes)}.`;

export const documentVoidedText = (
  type: MedicalDocumentType,
  name: string,
  reason: string,
) => `${documentTitle(type, name)} was voided. Reason: ${reason}`;

export const documentFileRemovedText = (
  type: MedicalDocumentType,
  name: string,
  reason: string,
) => `The file of ${documentTitle(type, name)} was removed. Reason: ${reason}`;
