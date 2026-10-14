// Reads a care episode's events for people. Their `before` and `after` hold
// raw stored values keyed by field name; this turns each into a label and a
// value: the type as words, days as dates, the clinic's id as its name. Pure,
// so the unit tests pin it.

import type { CareEpisodeType } from "@/prisma/generated/enums";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import type { EntryFieldChange } from "@/app/lib/utils/medical-entry-changes";

/** Each field a correction can change, in the order the form lists them. */
export const CARE_EPISODE_FIELD_LABELS: Record<string, string> = {
  type: "Type",
  startDate: "Start date",
  endDate: "End date",
  partnerId: "Clinic",
  reason: "Reason",
  notes: "Notes",
};

const FIELD_ORDER = Object.keys(CARE_EPISODE_FIELD_LABELS);

/** One field's stored value as it reads on a page. */
export const formatCareEpisodeFieldValue = (
  field: string,
  value: unknown,
  names: Record<string, string>,
): string => {
  if (value === null || value === undefined || value === "") {
    // An episode with no end day is still open.
    return field === "endDate" ? "open" : "none";
  }
  switch (field) {
    case "type":
      return CARE_EPISODE_TYPE_LABELS[value as CareEpisodeType] ?? String(value);
    case "startDate":
    case "endDate":
      return formatShelterDayOrNA(value as string);
    case "partnerId":
      return names[value as string] ?? "a record that no longer exists";
    default:
      return String(value);
  }
};

/**
 * What an event changed, one row per field, in the form's order: a
 * correction's fields, or the end day a close set.
 */
export const describeCareEpisodeChanges = (
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
      label: CARE_EPISODE_FIELD_LABELS[field] ?? field,
      from: formatCareEpisodeFieldValue(field, was[field], names),
      to: formatCareEpisodeFieldValue(field, now[field], names),
    }));
};
