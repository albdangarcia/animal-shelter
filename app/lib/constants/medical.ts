import type {
  DoseUnit,
  MedicalEntrySource,
  MedicalItemKind,
  MedicalRoute,
  TestResult,
} from "@/prisma/generated/enums";

// Display labels for the medical enums, in the order pickers list them.

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
