// Reads a medication order's events for people. Their `before` and `after`
// hold raw stored values keyed by field name; this turns each into a label
// and a value: days as dates, a slot by its name. Pure, so the unit tests pin
// it.

import type { DoseSlot } from "@/prisma/generated/enums";
import { DOSE_SLOT_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import type { EntryFieldChange } from "@/app/lib/utils/medical-entry-changes";

/** Each field an event can change, in the order the forms list them. */
export const MEDICATION_ORDER_FIELD_LABELS: Record<string, string> = {
  startDate: "Start date",
  firstSlot: "First dose",
  endDate: "End date",
  prescribedBy: "Prescribed by",
  instructions: "Instructions",
  discontinuedDate: "Discontinued from",
  discontinueReason: "Reason",
};

const FIELD_ORDER = Object.keys(MEDICATION_ORDER_FIELD_LABELS);

/** One field's stored value as it reads on a page. */
export const formatMedicationOrderFieldValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    // An order with no end day runs until it is discontinued.
    return field === "endDate" ? "until discontinued" : "none";
  }
  switch (field) {
    case "startDate":
    case "endDate":
    case "discontinuedDate":
      return formatShelterDayOrNA(value as string);
    case "firstSlot":
      return DOSE_SLOT_LABELS[value as DoseSlot] ?? String(value);
    default:
      return String(value);
  }
};

/**
 * What an event changed, one row per field, in the forms' order: a
 * correction's fields, or the day and reason of a discontinue.
 */
export const describeMedicationOrderChanges = (
  before: unknown,
  after: unknown,
): EntryFieldChange[] => {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b))
    .map((field) => ({
      field,
      label: MEDICATION_ORDER_FIELD_LABELS[field] ?? field,
      from: formatMedicationOrderFieldValue(field, was[field]),
      to: formatMedicationOrderFieldValue(field, now[field]),
    }));
};
