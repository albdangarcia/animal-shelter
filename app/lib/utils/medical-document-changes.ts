// Reads a medical document's events for people. Their `before` and `after`
// hold raw stored values keyed by field name; this turns each into a label
// and a value: the type as words, the day as a date, the entry by what it
// is. Pure, so the unit tests pin it.

import type { MedicalDocumentType } from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_TYPE_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import type { EntryFieldChange } from "@/app/lib/utils/medical-entry-changes";

/** Each field a correction can change, in the order the form lists them. */
export const DOCUMENT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  documentDate: "Document date",
  entryId: "Entry",
  notes: "Notes",
};

const FIELD_ORDER = Object.keys(DOCUMENT_FIELD_LABELS);

const NONE = "none";

/** One field's stored value as it reads on a page. */
export const formatDocumentFieldValue = (
  field: string,
  value: unknown,
  names: Record<string, string>,
): string => {
  if (value === null || value === undefined || value === "") return NONE;
  switch (field) {
    case "type":
      return MEDICAL_DOCUMENT_TYPE_LABELS[value as MedicalDocumentType] ?? String(value);
    case "documentDate":
      return formatShelterDayOrNA(value as string);
    case "entryId":
      return names[value as string] ?? "an entry that no longer exists";
    default:
      return String(value);
  }
};

/** What a correction changed, one row per field, in the form's order. */
export const describeDocumentChanges = (
  before: unknown,
  after: unknown,
  names: Record<string, string>,
): EntryFieldChange[] => {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b))
    .map((field) => ({
      field,
      label: DOCUMENT_FIELD_LABELS[field] ?? field,
      from: formatDocumentFieldValue(field, was[field], names),
      to: formatDocumentFieldValue(field, now[field], names),
    }));
};
