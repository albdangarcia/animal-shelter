import type {
  CareEpisodeType,
  DoseUnit,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryStatus,
  MedicalItemKind,
  MedicalProtocolStepKind,
  MedicalRoute,
  ReproductiveStatus,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
  TestResult,
} from "@/prisma/generated/enums";

/**
 * The kinds of care given from the catalog: each entry points at an item.
 * Surgeries and microchips have none.
 */
export const CATALOG_ENTRY_KINDS = [
  "VACCINE",
  "TEST",
  "TREATMENT",
] as const satisfies readonly MedicalEntryKind[];

export type CatalogEntryKind = (typeof CATALOG_ENTRY_KINDS)[number];

export const isCatalogEntryKind = (
  kind: MedicalEntryKind,
): kind is CatalogEntryKind =>
  (CATALOG_ENTRY_KINDS as readonly MedicalEntryKind[]).includes(kind);

// Display labels for the medical enums, in the order pickers list them.

/** What kind of care an entry records, as its badge and filters read. */
export const MEDICAL_ENTRY_KIND_LABELS: Record<MedicalEntryKind, string> = {
  VACCINE: "Vaccine",
  TEST: "Test",
  TREATMENT: "Treatment",
  SURGERY: "Surgery",
  MICROCHIP: "Microchip",
  EXAM: "Exam",
};

export const SURGERY_PROCEDURE_LABELS: Record<SurgeryProcedure, string> = {
  SPAY: "Spay",
  NEUTER: "Neuter",
  DENTAL: "Dental",
  AMPUTATION: "Amputation",
  ENUCLEATION: "Enucleation",
  MASS_REMOVAL: "Mass removal",
  OTHER: "Other",
};

export const SURGERY_EVIDENCE_LABELS: Record<SurgeryEvidence, string> = {
  OWNER_RECORDS: "Owner records",
  VET_RECORDS: "Vet records",
  TATTOO: "Tattoo",
  SCAR: "Scar",
  FOUND_ON_EXAM: "Found on exam",
};

/**
 * The evidence a person picks for a surgery done before intake. Found on an
 * exam isn't among them: the exam that found the spay or neuter records it,
 * linked back to itself.
 */
export const PICKABLE_SURGERY_EVIDENCE = [
  "OWNER_RECORDS",
  "VET_RECORDS",
  "TATTOO",
  "SCAR",
] as const satisfies readonly SurgeryEvidence[];

export const SPAY_NEUTER_EXEMPTION_REASON_LABELS: Record<
  SpayNeuterExemptionReason,
  string
> = {
  TOO_YOUNG_OR_UNDERWEIGHT: "Too young or underweight",
  MEDICAL_RISK: "Medical risk",
  PARTNER_WILL_ALTER: "Partner will alter",
  OTHER: "Other",
};

/** Which exam an entry is. Also what the entry is called. */
export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  INTAKE: "Intake exam",
  VET: "Vet exam",
  RECHECK: "Recheck exam",
  PRE_ADOPTION: "Pre-adoption exam",
};

export const EXAM_RESULT_LABELS: Record<ExamResult, string> = {
  NO_CONCERNS: "No concerns",
  NEEDS_TREATMENT: "Needs treatment",
  NEEDS_VET_REVIEW: "Needs vet review",
};

export const EXAM_FINDING_STATUS_LABELS: Record<ExamFindingStatus, string> = {
  NORMAL: "Normal",
  ABNORMAL: "Abnormal",
  NOT_EXAMINED: "Not examined",
};

export const REPRODUCTIVE_STATUS_LABELS: Record<ReproductiveStatus, string> = {
  INTACT: "Intact",
  ALTERED: "Altered",
  UNDETERMINED: "Undetermined",
};

/** What a problem-list row is. */
export const MEDICAL_CONDITION_TYPE_LABELS: Record<MedicalConditionType, string> = {
  CONDITION: "Condition",
  ALLERGY: "Allergy",
};

export const MEDICAL_CONDITION_STATUS_LABELS: Record<MedicalConditionStatus, string> = {
  ACTIVE: "Active",
  CHRONIC: "Chronic",
  RESOLVED: "Resolved",
};

export const CARE_EPISODE_TYPE_LABELS: Record<CareEpisodeType, string> = {
  UNDER_VET_CARE: "Under vet care",
  HOSPITALISED_IN_HOUSE: "Hospitalised in house",
  HOSPITALISED_OFF_SITE: "Hospitalised off site",
};

/** What kind of product a catalog item is. */
export const MEDICAL_ITEM_KIND_LABELS: Record<MedicalItemKind, string> = {
  VACCINE: "Vaccine",
  TEST: "Test",
  TREATMENT: "Treatment",
};

export const MEDICAL_ITEM_KIND_PLURALS: Record<MedicalItemKind, string> = {
  VACCINE: "Vaccines",
  TEST: "Tests",
  TREATMENT: "Treatments",
};

export const MEDICAL_ROUTE_LABELS: Record<MedicalRoute, string> = {
  ORAL: "Oral",
  SUBCUTANEOUS: "Subcutaneous (SQ)",
  INTRAMUSCULAR: "Intramuscular (IM)",
  INTRANASAL: "Intranasal",
  TOPICAL: "Topical",
  OPHTHALMIC: "Ophthalmic (eye)",
  OTIC: "Otic (ear)",
  INTRAVENOUS: "Intravenous (IV)",
  TRANSDERMAL: "Transdermal",
};

export const DOSE_UNIT_LABELS: Record<DoseUnit, string> = {
  MG: "mg",
  ML: "mL",
  TABLET: "tablet",
  CAPSULE: "capsule",
  DROP: "drop",
  APPLICATION: "application",
  UNIT: "unit",
};

export const MEDICAL_ENTRY_SOURCE_LABELS: Record<MedicalEntrySource, string> = {
  IN_HOUSE: "In house",
  OUTSIDE_VET: "Outside vet",
  BEFORE_INTAKE: "Before intake",
};

export const MEDICAL_ENTRY_STATUS_LABELS: Record<MedicalEntryStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Given",
  DECLINED: "Declined",
};

export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  POSITIVE: "Positive",
  NEGATIVE: "Negative",
  INCONCLUSIVE: "Inconclusive",
  INVALID: "Invalid",
};

// Units that count things take a plural; measures (mg, mL) don't.
const COUNTED_UNITS: ReadonlySet<DoseUnit> = new Set<DoseUnit>([
  "TABLET",
  "CAPSULE",
  "DROP",
  "APPLICATION",
  "UNIT",
]);

/** "2.5 mL", "1 tablet", "2 tablets". */
export const formatDose = (amount: number, unit: DoseUnit): string => {
  const label = DOSE_UNIT_LABELS[unit];
  const plural = COUNTED_UNITS.has(unit) && amount !== 1;
  return `${amount} ${plural ? `${label}s` : label}`;
};

/** The longest reason a void or a decline can carry. */
export const MEDICAL_REASON_MAX_LENGTH = 1000;

/**
 * The most animals one batch covers. A room or a litter fits well inside it;
 * past it, a mistake in the shared values reaches too many records at once.
 */
export const MAX_BATCH_SIZE = 50;

/** The longest name a problem-list row can carry. */
export const MEDICAL_CONDITION_NAME_MAX_LENGTH = 120;

/**
 * How many days after a surgery an animal reads as recovering from it: from
 * the surgery's day through this many days after. Any procedure counts, a
 * routine spay included, since the animal is recovering either way.
 */
export const RECOVERY_DAYS = 14;

/** What a protocol step schedules, in the order the editor lists them. */
export const MEDICAL_PROTOCOL_STEP_KIND_LABELS: Record<MedicalProtocolStepKind, string> = {
  VACCINE: "Vaccine",
  TEST: "Test",
  TREATMENT: "Treatment",
  SPAY_NEUTER: "Spay/neuter",
  EXAM: "Exam",
  MICROCHIP: "Microchip",
};

/** The longest name a medical protocol can carry. */
export const MEDICAL_PROTOCOL_NAME_MAX_LENGTH = 80;

/**
 * The most doses one protocol step schedules. Weekly boosters through a
 * puppy's first months fit; past it, a mistyped interval would fill the due
 * list.
 */
export const MAX_PROTOCOL_STEP_DOSES = 12;

/** The furthest after intake a protocol step's first dose can be planned. */
export const MAX_PROTOCOL_OFFSET_DAYS = 365;

/**
 * The oldest age a protocol step can wait for before its first dose: five
 * years of 365 days.
 */
export const MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS = 1825;
