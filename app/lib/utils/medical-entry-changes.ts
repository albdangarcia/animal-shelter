// Reads a medical entry event's `before` and `after` for people. They hold raw
// stored values keyed by field name; this turns each into a label and a
// value: enums as words, days as dates, ids as names. Pure, so the unit tests
// pin it.

import type {
  DoseUnit,
  MedicalEntrySource,
  MedicalRoute,
  TestResult,
} from "@/prisma/generated/enums";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ROUTE_LABELS,
  TEST_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";

export const MEDICAL_ENTRY_FIELD_LABELS: Record<string, string> = {
  itemId: "Item",
  completedDate: "Date given",
  source: "Source",
  vetPartnerId: "Vet clinic",
  vetName: "Vet",
  administeredById: "Given by",
  notes: "Notes",
  manufacturer: "Manufacturer",
  lotNumber: "Lot number",
  lotExpiryDate: "Lot expiry",
  route: "Route",
  site: "Site",
  rabiesTagNumber: "Rabies tag",
  durationMonths: "Duration",
  validUntilDate: "Valid until",
  results: "Results",
  doseAmount: "Dose",
  doseUnit: "Dose unit",
};

// The order fields are listed in, so a change reads top to bottom like the
// form.
const FIELD_ORDER = Object.keys(MEDICAL_ENTRY_FIELD_LABELS);

const NONE = "none";

/** One field's stored value as it reads on a page. */
export const formatEntryFieldValue = (
  field: string,
  value: unknown,
  names: Record<string, string>,
): string => {
  if (value === null || value === undefined || value === "") {
    return field === "completedDate" ? "unknown" : NONE;
  }
  switch (field) {
    case "itemId":
    case "vetPartnerId":
    case "administeredById":
      return names[value as string] ?? "a record that no longer exists";
    case "completedDate":
    case "lotExpiryDate":
    case "validUntilDate":
      return formatShelterDayOrNA(value as string);
    case "source":
      return MEDICAL_ENTRY_SOURCE_LABELS[value as MedicalEntrySource] ?? String(value);
    case "route":
      return MEDICAL_ROUTE_LABELS[value as MedicalRoute] ?? String(value);
    case "doseUnit":
      return DOSE_UNIT_LABELS[value as DoseUnit] ?? String(value);
    case "durationMonths":
      return `${value} months`;
    case "results":
      return Array.isArray(value) && value.length > 0
        ? value
            .map(
              (row: { analyteName: string; result: TestResult }) =>
                `${row.analyteName} ${(TEST_RESULT_LABELS[row.result] ?? row.result).toLowerCase()}`,
            )
            .join(", ")
        : NONE;
    default:
      return String(value);
  }
};

export interface EntryFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** What an EDITED event changed, one row per field, in form order. */
export const describeEntryChanges = (
  before: unknown,
  after: unknown,
  names: Record<string, string>,
): EntryFieldChange[] => {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = (after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort(
    (a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b),
  );
  return fields.map((field) => ({
    field,
    label: MEDICAL_ENTRY_FIELD_LABELS[field] ?? field,
    from: formatEntryFieldValue(field, was[field], names),
    to: formatEntryFieldValue(field, now[field], names),
  }));
};
