// Reads a medical entry event's `before` and `after` for people. They hold raw
// stored values keyed by field name; this turns each into a label and a
// value: enums as words, days as dates, ids as names. Pure, so the unit tests
// pin it.

import type {
  DoseUnit,
  DeathCircumstances,
  EuthanasiaReasonCategory,
  MedicalEntryKind,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalRoute,
  ReproductiveStatus,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
  TestResult,
} from "@/prisma/generated/enums";
import {
  DOSE_UNIT_LABELS,
  DEATH_CIRCUMSTANCES_LABELS,
  EUTHANASIA_REASON_CATEGORY_LABELS,
  EXAM_FINDING_STATUS_LABELS,
  EXAM_RESULT_LABELS,
  EXAM_TYPE_LABELS,
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ENTRY_STATUS_LABELS,
  MEDICAL_ROUTE_LABELS,
  REPRODUCTIVE_STATUS_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_EVIDENCE_LABELS,
  SURGERY_PROCEDURE_LABELS,
  TEST_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { examBodySystemLabel } from "@/app/lib/constants/exam";
import { orderFindings } from "@/app/lib/utils/exam-findings";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { protocolTitle } from "@/app/lib/utils/medical-protocol-text";

export const MEDICAL_ENTRY_FIELD_LABELS: Record<string, string> = {
  itemId: "Item",
  procedure: "Procedure",
  chipNumber: "Chip number",
  examType: "Exam type",
  brand: "Brand",
  status: "Status",
  dueDate: "Due date",
  completedDate: "Date given",
  source: "Source",
  vetPartnerId: "Vet clinic",
  vetName: "Vet",
  administeredById: "Given by",
  evidence: "Evidence",
  surgeon: "Surgeon",
  findings: "Findings",
  anesthesiaNotes: "Anesthesia notes",
  overallResult: "Result",
  examFindings: "Findings",
  reproductiveStatus: "Reproductive status",
  notes: "Notes",
  declineReason: "Reason declined",
  exemptionReason: "Reason for the exemption",
  reviewDate: "Review date",
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
  reasonCategory: "Reason category",
  reasonNotes: "Reason notes",
  authorizedById: "Authorized by",
  performedById: "Performed by",
  performedByName: "Outside performer",
  drug: "Drug",
  dose: "Dose including unit",
  witness: "Witness",
  bodyDisposition: "Body disposition",
  circumstances: "Circumstances",
  circumstanceNotes: "Circumstance notes",
  cause: "Cause",
  necropsyRequested: "Necropsy requested",
};

// The order fields are listed in, so a change reads top to bottom like the
// form.
const FIELD_ORDER = Object.keys(MEDICAL_ENTRY_FIELD_LABELS);

// Links an event stores to other records written with the entry: an exam's
// vitals entry, the exam a spay or neuter was found on, and the protocol
// step that scheduled it. They are never corrected through the entry, so a
// change never lists them.
const UNLISTED_FIELDS = new Set(["vitalsLogId", "foundOnExamId", "protocolStepId", "outcomeId", "kind"]);

const NONE = "none";

/** One field's stored value as it reads on a page. */
export const formatEntryFieldValue = (
  field: string,
  value: unknown,
  names: Record<string, string>,
  kind?: MedicalEntryKind,
): string => {
  if (value === null || value === undefined || value === "") {
    return ["completedDate", "cause", "necropsyRequested", "bodyDisposition"].includes(field) ? "unknown" : NONE;
  }
  switch (field) {
    case "authorizedById":
    case "performedById":
      return names[value as string] ?? "a person no longer on record";
    case "reasonCategory":
      return EUTHANASIA_REASON_CATEGORY_LABELS[value as EuthanasiaReasonCategory] ?? String(value);
    case "circumstances":
      return DEATH_CIRCUMSTANCES_LABELS[value as DeathCircumstances] ?? String(value);
    case "necropsyRequested":
      return value === true ? "Yes" : "No";
    case "itemId":
    case "vetPartnerId":
    case "administeredById":
      return names[value as string] ?? "a record that no longer exists";
    case "dueDate":
    case "completedDate":
    case "lotExpiryDate":
    case "validUntilDate":
    case "reviewDate":
      return formatShelterDayOrNA(value as string);
    case "procedure":
      return SURGERY_PROCEDURE_LABELS[value as SurgeryProcedure] ?? String(value);
    case "evidence":
      return SURGERY_EVIDENCE_LABELS[value as SurgeryEvidence] ?? String(value);
    case "examType":
      return EXAM_TYPE_LABELS[value as ExamType] ?? String(value);
    case "overallResult":
      return EXAM_RESULT_LABELS[value as ExamResult] ?? String(value);
    case "reproductiveStatus":
      return REPRODUCTIVE_STATUS_LABELS[value as ReproductiveStatus] ?? String(value);
    case "exemptionReason":
      return (
        SPAY_NEUTER_EXEMPTION_REASON_LABELS[value as SpayNeuterExemptionReason] ??
        String(value)
      );
    case "status":
      return value === "COMPLETED" && (kind === "DEATH" || kind === "EUTHANASIA")
        ? "Recorded"
        : MEDICAL_ENTRY_STATUS_LABELS[value as MedicalEntryStatus] ?? String(value);
    case "source":
      return MEDICAL_ENTRY_SOURCE_LABELS[value as MedicalEntrySource] ?? String(value);
    case "route":
      return kind === "EUTHANASIA" ? String(value) : MEDICAL_ROUTE_LABELS[value as MedicalRoute] ?? String(value);
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

interface StoredFinding {
  bodySystem: string;
  status: ExamFindingStatus;
  notes: string | null;
}

// One body system's finding as a change reads it: "abnormal (Grade II
// murmur)", "normal", or "none" for a system the exam had no finding for.
const findingText = (finding: StoredFinding | undefined) =>
  finding
    ? `${(EXAM_FINDING_STATUS_LABELS[finding.status] ?? finding.status).toLowerCase()}${
        finding.notes ? ` (${finding.notes})` : ""
      }`
    : NONE;

/**
 * What a correction changed in an exam's findings, one row per body system
 * whose finding or note changed, in the form's order: "Heart: normal →
 * abnormal (Grade II murmur)". The event stores every finding before and
 * after.
 */
const findingChanges = (before: unknown, after: unknown): EntryFieldChange[] => {
  const was = (Array.isArray(before) ? before : []) as StoredFinding[];
  const now = (Array.isArray(after) ? after : []) as StoredFinding[];
  const keys = new Set(orderFindings([...was, ...now]).map((row) => row.bodySystem));
  return [...keys].flatMap((key) => {
    const from = findingText(was.find((row) => row.bodySystem === key));
    const to = findingText(now.find((row) => row.bodySystem === key));
    return from === to
      ? []
      : [{ field: `examFindings.${key}`, label: examBodySystemLabel(key), from, to }];
  });
};

/**
 * What an event changed, one row per field, in form order: an EDITED event's
 * corrections, or a RESCHEDULED event's due date. An exam's findings are a
 * row per body system that changed.
 */
export const describeEntryChanges = (
  before: unknown,
  after: unknown,
  names: Record<string, string>,
  kind?: MedicalEntryKind,
): EntryFieldChange[] => {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = (after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .filter((field) => !UNLISTED_FIELDS.has(field))
    .sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b));
  return fields.flatMap((field) =>
    field === "examFindings"
      ? findingChanges(was[field], now[field])
      : [
          {
            field,
            label: field === "completedDate" && (kind === "DEATH" || kind === "EUTHANASIA")
              ? `Date of ${kind === "DEATH" ? "death" : "euthanasia"}`
              : MEDICAL_ENTRY_FIELD_LABELS[field] ?? field,
            from: formatEntryFieldValue(field, was[field], names, kind),
            to: formatEntryFieldValue(field, now[field], names, kind),
          },
        ],
  );
};

/**
 * Why care was declined, from its `DECLINED` event's `after`: the words given
 * or, for a spay/neuter exemption, its reason, its review day and any words
 * given with it. "Too young or underweight, review on Nov 3, 2026."
 */
export const declineText = (after: unknown): string => {
  const { declineReason, exemptionReason, reviewDate } = (after ?? {}) as {
    declineReason?: string | null;
    exemptionReason?: string | null;
    reviewDate?: string | null;
  };
  if (!exemptionReason) return declineReason ?? "";
  const terms = [
    formatEntryFieldValue("exemptionReason", exemptionReason, {}),
    reviewDate
      ? `review on ${formatShelterDayOrNA(reviewDate)}`
      : "no review date",
  ].join(", ");
  return declineReason ? `${terms}. ${declineReason}` : `${terms}.`;
};

/**
 * How an entry's CREATED event reads before its actor: "Recorded",
 * "Scheduled", "Scheduled from the Puppy protocol" (by the protocol's name
 * now, through `names`), or "Exemption recorded" for an exemption recorded
 * on its own, which is written declined.
 */
export const createdEventVerb = (
  after: unknown,
  names: Record<string, string>,
): string => {
  const { status, protocolStepId } = (after ?? {}) as {
    status?: string;
    protocolStepId?: string;
  };
  if (status === "SCHEDULED") {
    const protocol = protocolStepId ? names[protocolStepId] : undefined;
    return protocol ? `Scheduled from the ${protocolTitle(protocol)}` : "Scheduled";
  }
  return status === "DECLINED" ? "Exemption recorded" : "Recorded";
};
