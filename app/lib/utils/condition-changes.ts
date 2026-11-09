// Reads a problem-list row's events for people. Their `before` and `after`
// hold raw stored values keyed by field name; this turns each into a label
// and a value: enums as words, days as dates, ids as names. Pure, so the unit
// tests pin it.

import type {
  MedicalConditionStatus,
  MedicalConditionType,
} from "@/prisma/generated/enums";
import {
  MEDICAL_CONDITION_STATUS_LABELS,
  MEDICAL_CONDITION_TYPE_LABELS,
} from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import type { EntryFieldChange } from "@/app/lib/utils/medical-entry-changes";

/** Each field a correction can change, in the order the form lists them. */
export const CONDITION_FIELD_LABELS: Record<string, string> = {
  type: "Type",
  name: "Name",
  status: "Status",
  onsetDate: "Onset date",
  resolvedDate: "Resolved date",
  diagnosedBy: "Diagnosed by",
  sourceEntryId: "Found on",
  characteristicId: "Trait",
  notes: "Notes",
};

const FIELD_ORDER = Object.keys(CONDITION_FIELD_LABELS);

const NONE = "none";

/** One field's stored value as it reads on a page. */
export const formatConditionFieldValue = (
  field: string,
  value: unknown,
  names: Record<string, string>,
): string => {
  if (value === null || value === undefined || value === "") return NONE;
  switch (field) {
    case "type":
      return MEDICAL_CONDITION_TYPE_LABELS[value as MedicalConditionType] ?? String(value);
    case "status":
      return (
        MEDICAL_CONDITION_STATUS_LABELS[value as MedicalConditionStatus] ?? String(value)
      );
    case "onsetDate":
    case "resolvedDate":
      return formatShelterDayOrNA(value as string);
    case "sourceEntryId":
    case "characteristicId":
      return names[value as string] ?? "a record that no longer exists";
    default:
      return String(value);
  }
};

/** What a correction changed, one row per field, in the form's order. */
export const describeConditionChanges = (
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
      label: CONDITION_FIELD_LABELS[field] ?? field,
      from: formatConditionFieldValue(field, was[field], names),
      to: formatConditionFieldValue(field, now[field], names),
    }));
};
