import type { TransactionClient } from "@/app/lib/prisma";
import {
  ExamFindingStatus,
  type ExamType,
  MedicalEntryKind,
  MedicalEntrySource,
  SpayNeuterExemptionReason,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { calendarDay, formatShelterDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  medicalEntryName,
  type NameableMedicalEntry,
} from "@/app/lib/utils/medical-entry-name";
import {
  DOSE_UNIT_LABELS,
  EXAM_FINDING_STATUS_LABELS,
  EXAM_RESULT_LABELS,
  EXAM_TYPE_LABELS,
  MEDICAL_ROUTE_LABELS,
  REPRODUCTIVE_STATUS_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_EVIDENCE_LABELS,
  SURGERY_PROCEDURE_LABELS,
  TEST_RESULT_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";
import { examBodySystemLabel } from "@/app/lib/constants/exam";
import { orderFindings } from "@/app/lib/utils/exam-findings";
import {
  KIND_NOUN,
  type CatalogItem,
  type EntryField,
  type EntryValues,
  type StoredFinding,
  type StoredResult,
} from "@/app/lib/services/medical-entry-values";

/**
 * The activity text the entry service writes: what an entry is called, how
 * its care is said to have happened, and how a recording, an exemption or a
 * correction reads in the animal's activity feed. Each line is written once,
 * when the change is made, and never rewritten.
 *
 * Like the service, this module has no `next/*` and no auth imports.
 */

/** A batch, as the text names it: by how many animals it covers. */
interface BatchCount {
  size: number;
}

/** The exam a spay or neuter was found on, as its evidence names it. */
export interface FoundOnExamText {
  examType: ExamType;
  completedDate: string | null;
}

/** What an exemption's text reads: its reason, its note and its review day. */
interface ExemptionTextValues {
  exemptionReason: SpayNeuterExemptionReason;
  declineReason: string | null;
  reviewDate: CalendarDay | null;
}

// What the activity text calls the entry: "DHPP vaccine", "Spay surgery",
// "Other surgery", "Microchip 985141000100003" (plain "Microchip" until its
// number is known), "Intake exam".
export const subjectText = (
  entry: NameableMedicalEntry & { chipNumber?: string | null },
) => {
  const name = medicalEntryName(entry);
  switch (entry.kind) {
    case MedicalEntryKind.SURGERY:
      return entry.procedure === SurgeryProcedure.OTHER ? name : `${name} surgery`;
    case MedicalEntryKind.MICROCHIP:
      return entry.chipNumber ? `${name} ${entry.chipNumber}` : name;
    case MedicalEntryKind.EXAM:
      return name;
    default:
      return `${name} ${KIND_NOUN[entry.kind]}`;
  }
};

// How the activity text says the care happened.
const KIND_VERB: Record<MedicalEntryKind, string> = {
  VACCINE: "given",
  TEST: "run",
  TREATMENT: "given",
  SURGERY: "done",
  MICROCHIP: "implanted",
  EXAM: "done",
};

// A chip on the animal when it arrived was found on a scan, not implanted.
export const verbFor = (kind: MedicalEntryKind, source: MedicalEntrySource | null) =>
  kind === MedicalEntryKind.MICROCHIP && source === MedicalEntrySource.BEFORE_INTAKE
    ? "found"
    : KIND_VERB[kind];

// "a", "a and b", "a, b and c".
export const joinList = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const dayText = (day: string | null | undefined) =>
  day ? formatShelterDay(calendarDay(day)) : "an unknown date";

// Said on each animal's activity row when its entry came from a batch.
export const batchText = (batch: BatchCount | null | undefined) =>
  batch ? ` Part of a batch of ${batch.size} animals.` : "";

// A body system as the text names it: "heart", "mouth and teeth".
const systemText = (key: string) => examBodySystemLabel(key).toLowerCase();

const findingStatusText = (finding: StoredFinding | undefined) =>
  finding ? EXAM_FINDING_STATUS_LABELS[finding.status].toLowerCase() : "none";

// What changed in an exam's findings, system by system: "heart: normal to
// abnormal", "ears: note edited".
const describeFindings = (before: StoredFinding[], after: StoredFinding[]) => {
  const keys = orderFindings([...before, ...after]).map((row) => row.bodySystem);
  return [...new Set(keys)].flatMap((key) => {
    const was = before.find((row) => row.bodySystem === key);
    const now = after.find((row) => row.bodySystem === key);
    if (was?.status !== now?.status) {
      return [`${systemText(key)}: ${findingStatusText(was)} to ${findingStatusText(now)}`];
    }
    if ((was?.notes ?? null) === (now?.notes ?? null)) return [];
    const change = !was?.notes ? "added" : !now?.notes ? "removed" : "edited";
    return [`${systemText(key)}: note ${change}`];
  });
};

const describeResults = (results: StoredResult[] | undefined) =>
  results && results.length > 0
    ? results
        .map((row) => `${row.analyteName} ${TEST_RESULT_LABELS[row.result].toLowerCase()}`)
        .join(", ")
    : null;

// Free text that can run long: a change says it was added, edited or
// removed, rather than quoting it.
const PROSE_FIELDS = {
  notes: "notes",
  findings: "findings",
  anesthesiaNotes: "anesthesia notes",
} as const satisfies Partial<Record<EntryField, string>>;

type ProseField = keyof typeof PROSE_FIELDS;

const isProseField = (field: EntryField): field is ProseField =>
  field in PROSE_FIELDS;

const FIELD_LABELS: Record<Exclude<EntryField, ProseField>, string> = {
  itemId: "item",
  completedDate: "date given",
  source: "source",
  vetPartnerId: "vet clinic",
  vetName: "vet",
  administeredById: "person who gave it",
  manufacturer: "manufacturer",
  lotNumber: "lot number",
  lotExpiryDate: "lot expiry",
  route: "route",
  site: "site",
  rabiesTagNumber: "rabies tag",
  durationMonths: "duration",
  validUntilDate: "valid-until date",
  results: "results",
  doseAmount: "dose",
  doseUnit: "dose unit",
  procedure: "procedure",
  surgeon: "surgeon",
  evidence: "evidence",
  chipNumber: "chip number",
  brand: "brand",
  examType: "exam type",
  overallResult: "result",
  reproductiveStatus: "reproductive status",
  examFindings: "findings",
};

const SOURCE_TEXT: Record<MedicalEntrySource, string> = {
  IN_HOUSE: "in house",
  OUTSIDE_VET: "by an outside vet",
  BEFORE_INTAKE: "before intake",
};

interface Names {
  items: Map<string, string>;
  partners: Map<string, string>;
  people: Map<string, string>;
}

export const readNames = async (
  tx: TransactionClient,
  values: EntryValues[],
): Promise<Names> => {
  const ids = (pick: (v: EntryValues) => string | null) => [
    ...new Set(values.map(pick).filter((id): id is string => !!id)),
  ];
  // One after another: a transaction is one connection.
  const items = await tx.medicalItem.findMany({
    where: { id: { in: ids((v) => v.itemId) } },
    select: { id: true, name: true },
  });
  const partners = await tx.partner.findMany({
    where: { id: { in: ids((v) => v.vetPartnerId) } },
    select: { id: true, name: true },
  });
  const people = await tx.person.findMany({
    where: { id: { in: ids((v) => v.administeredById) } },
    select: { id: true, name: true },
  });
  const toMap = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.id, row.name]));
  return { items: toMap(items), partners: toMap(partners), people: toMap(people) };
};

const displayValue = (
  field: Exclude<EntryField, ProseField>,
  values: EntryValues,
  names: Names,
): string | null => {
  switch (field) {
    case "itemId":
      return values.itemId ? (names.items.get(values.itemId) ?? null) : null;
    case "completedDate":
      return values.completedDate ? dayText(values.completedDate) : "unknown";
    case "lotExpiryDate":
    case "validUntilDate":
      return values[field] ? dayText(values[field]) : null;
    case "source":
      return SOURCE_TEXT[values.source];
    case "vetPartnerId":
      return values.vetPartnerId
        ? (names.partners.get(values.vetPartnerId) ?? null)
        : null;
    case "administeredById":
      return values.administeredById
        ? (names.people.get(values.administeredById) ?? null)
        : null;
    case "route":
      return values.route ? MEDICAL_ROUTE_LABELS[values.route] : null;
    case "durationMonths":
      return values.durationMonths ? `${values.durationMonths} months` : null;
    case "results":
      return describeResults(values.results);
    case "doseAmount":
      return values.doseAmount !== null && values.doseAmount !== undefined
        ? values.doseUnit
          ? formatDose(values.doseAmount, values.doseUnit)
          : String(values.doseAmount)
        : null;
    case "doseUnit":
      return values.doseUnit ? DOSE_UNIT_LABELS[values.doseUnit] : null;
    case "procedure":
      return values.procedure
        ? SURGERY_PROCEDURE_LABELS[values.procedure].toLowerCase()
        : null;
    case "evidence":
      return values.evidence
        ? SURGERY_EVIDENCE_LABELS[values.evidence].toLowerCase()
        : null;
    case "examType":
      return values.examType ? EXAM_TYPE_LABELS[values.examType].toLowerCase() : null;
    case "overallResult":
      return values.overallResult
        ? EXAM_RESULT_LABELS[values.overallResult].toLowerCase()
        : null;
    case "reproductiveStatus":
      return values.reproductiveStatus
        ? REPRODUCTIVE_STATUS_LABELS[values.reproductiveStatus].toLowerCase()
        : null;
    case "examFindings":
      return null;
    default:
      return (values[field] as string | null | undefined) ?? null;
  }
};

export const describeChange = (
  field: EntryField,
  before: EntryValues,
  after: EntryValues,
  names: Names,
): string => {
  if (isProseField(field)) {
    const noun = PROSE_FIELDS[field];
    return !before[field]
      ? `${noun} were added`
      : !after[field]
        ? `${noun} were removed`
        : `${noun} were edited`;
  }
  if (field === "examFindings") {
    return `the findings changed (${describeFindings(
      before.examFindings ?? [],
      after.examFindings ?? [],
    ).join("; ")})`;
  }
  const from = displayValue(field, before, names);
  const to = displayValue(field, after, names);
  const label = FIELD_LABELS[field];
  if (from === null) return `the ${label} was set to ${to}`;
  if (to === null) return `the ${label} was cleared (was ${from})`;
  return `the ${label} changed from ${from} to ${to}`;
};

// "too young or underweight. Review on Nov 3, 2026. Note: …"
export const exemptionText = ({
  exemptionReason,
  declineReason,
  reviewDate,
}: ExemptionTextValues) =>
  `${SPAY_NEUTER_EXEMPTION_REASON_LABELS[exemptionReason].toLowerCase()}.${
    reviewDate ? ` Review on ${dayText(reviewDate)}.` : ""
  }${declineReason ? ` Note: ${declineReason}` : ""}`;

// What an exam concluded: " Result: needs vet review. Abnormal: heart." The
// systems are set apart by semicolons, since some names hold an "and" of
// their own: "Abnormal: ears; mouth and teeth."
const examText = (values: EntryValues) => {
  if (!values.overallResult) return "";
  const abnormal = (values.examFindings ?? [])
    .filter((row) => row.status === ExamFindingStatus.ABNORMAL)
    .map((row) => systemText(row.bodySystem));
  return ` Result: ${EXAM_RESULT_LABELS[values.overallResult].toLowerCase()}.${
    abnormal.length > 0 ? ` Abnormal: ${abnormal.join("; ")}.` : ""
  }`;
};

/**
 * "DHPP vaccine recorded: given in house, on Oct 15, 2026 (due Oct 14,
 * 2026).", "Neuter surgery recorded: done before intake, on an unknown
 * date. Evidence: tattoo.", "Neuter surgery recorded: done before intake, on
 * an unknown date. Evidence: found on the intake exam of Oct 3, 2026." or
 * "Intake exam recorded: done in house, on Oct 3, 2026. Result: needs vet
 * review. Abnormal: heart."
 */
export const recordedSummary = async (
  tx: TransactionClient,
  item: CatalogItem | null,
  kind: MedicalEntryKind,
  values: EntryValues,
  dueDate: CalendarDay | null,
  batch: BatchCount | null | undefined,
  foundOn: FoundOnExamText | null = null,
) => {
  const partnerName = values.vetPartnerId
    ? (await readNames(tx, [values])).partners.get(values.vetPartnerId)
    : undefined;
  const subject = subjectText({
    kind,
    item,
    procedure: values.procedure,
    chipNumber: values.chipNumber,
    examType: values.examType,
  });
  return `${subject} recorded: ${verbFor(kind, values.source)} ${SOURCE_TEXT[values.source]}${partnerName ? ` at ${partnerName}` : ""}, on ${dayText(values.completedDate)}${
    dueDate ? ` (due ${dayText(dueDate)})` : ""
  }.${values.results ? ` Results: ${describeResults(values.results)}.` : ""}${
    values.evidence
      ? ` Evidence: ${
          foundOn
            ? `found on the ${EXAM_TYPE_LABELS[foundOn.examType].toLowerCase()} of ${dayText(foundOn.completedDate)}`
            : SURGERY_EVIDENCE_LABELS[values.evidence].toLowerCase()
        }.`
      : ""
  }${examText(values)}${batchText(batch)}`;
};
