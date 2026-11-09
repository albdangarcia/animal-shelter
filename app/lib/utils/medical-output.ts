import type {
  CareEpisodeType, DoseSlot, DoseUnit, ExamFindingStatus, ExamResult, ExamType,
  MedicalConditionStatus, MedicalConditionType, MedicalDocumentType,
  MedicalEntryKind, MedicalEntrySource, MedicalEntryStatus, MedicalRoute,
  MedicationFrequency, Sex, SurgeryEvidence, SurgeryProcedure, TestResult,
} from "@/prisma/generated/enums";
import { EXAM_TYPE_LABELS } from "../constants/medical";
import { formatShelterDay, formatTimeOfDay, type CalendarDay } from "./shelter-day";
import type { MicrochipRegistration } from "./microchip-registration";
import type { RabiesStatus } from "./medical-days";
import type { SpayNeuterStatus } from "./spay-neuter";
import type { OrderState } from "./medication-slots";

/** A positive recorded fact; it says nothing about current vaccine coverage. */
export const RECORDED_VACCINATION_FACT = {
  kind: "VACCINE", status: "COMPLETED", voidedAt: null,
} as const;

export const isRecordedVaccination = (entry: {
  kind: MedicalEntryKind; status: MedicalEntryStatus; voidedAt: Date | null;
}): boolean => entry.kind === RECORDED_VACCINATION_FACT.kind
  && entry.status === RECORDED_VACCINATION_FACT.status
  && entry.voidedAt === null;

export type MedicalOutputProvenance =
  | "In house" | "Outside vet" | "Before intake"
  | "Given in foster" | "Recorded from a foster's report";

/** Immutable report provenance wins even after a correction to source. */
export const medicalOutputProvenance = (entry: {
  kind: MedicalEntryKind; source: MedicalEntrySource;
  reportedByFoster: boolean; vetReportId: string | null;
}): MedicalOutputProvenance => {
  if (entry.vetReportId) return "Recorded from a foster's report";
  if (entry.reportedByFoster && entry.kind === "TREATMENT") return "Given in foster";
  return { IN_HOUSE: "In house", OUTSIDE_VET: "Outside vet", BEFORE_INTAKE: "Before intake" }[entry.source] as MedicalOutputProvenance;
};

export const MEDICAL_HISTORY_SCOPE_TEXT = "This handout contains available, current non-voided care records across the animal's stays. It excludes internal audit history and end-of-life records.";
export const MEDICAL_OUTPUT_COPY_TEXT = "Generated from the record at the time shown. Printed or saved copies do not update when the record changes.";
export const MEDICAL_HISTORY_EMPTY_TEXT = {
  completedCare: "No completed care records available.",
  conditions: "No condition or allergy records available.",
  careEpisodes: "No care episode records available.",
  medications: "No medication order records available.",
  plannedCare: "No planned care records available.",
  documents: "No relevant document records available.",
  chips: "No microchip records available.",
} as const;

export const medicalOutputDayText = (day: CalendarDay | null): string =>
  day ? formatShelterDay(day) : "Date unknown";

/**
 * When a handout was generated, as the shelter's wall clock read: the day and
 * the time on it, e.g. "Oct 17, 2026, 11:00 AM". Both come from one reading of
 * the shelter's clock, so no viewer's own zone enters.
 */
export const medicalOutputGeneratedText = (day: CalendarDay, time: string): string =>
  `${formatShelterDay(day)}, ${formatTimeOfDay(time)}`;

/** An exam's name. The type's label may already end in "exam"; it is said once. */
export const medicalOutputExamLabel = (examType: ExamType): string => {
  const label = EXAM_TYPE_LABELS[examType];
  return /\bexam$/i.test(label) ? label : `${label} exam`;
};

/** Explicit output shapes: never extend the staff record or spread its DTO. */
export interface MedicalOutputAnimal {
  id: string;
  name: string;
  species: string;
  breeds: string[];
  sex: Sex;
  birthDate: CalendarDay;
  primaryColor: string;
}

export interface MedicalOutputChip extends Pick<
  MicrochipRegistration,
  "registrationStatus" | "registryName" | "registrationDate"
> {
  chipNumber: string;
  brand: string | null;
  completedDate: CalendarDay | null;
}

type OutputAlteredStatus =
  | Pick<Extract<SpayNeuterStatus, { status: "ALTERED" }>, "status" | "procedure" | "completedDate">
  | Pick<Extract<SpayNeuterStatus, { status: "EXEMPT" }>, "status" | "reason" | "reviewDate">
  | Pick<Extract<SpayNeuterStatus, { status: "INTACT" }>, "status" | "examDate" | "lapsedOn">
  | Pick<Extract<SpayNeuterStatus, { status: "UNKNOWN" }>, "status" | "lapsedOn">;

interface CompletedCareCommon {
  completedDate: CalendarDay | null;
  provenance: MedicalOutputProvenance;
}

export type CompletedMedicalOutput = CompletedCareCommon & (
  | { kind: "VACCINE"; product: string; manufacturer: string | null; lotNumber: string | null;
      lotExpiryDate: CalendarDay | null; route: MedicalRoute | null; site: string | null;
      rabiesTagNumber: string | null; durationMonths: number | null; validUntilDate: CalendarDay | null }
  | { kind: "TEST"; product: string; results: { analyteName: string; result: TestResult }[] }
  | { kind: "TREATMENT"; product: string; doseAmount: number | null; doseUnit: DoseUnit | null; route: MedicalRoute | null }
  | { kind: "SURGERY"; procedure: SurgeryProcedure; evidence: SurgeryEvidence | null }
  | { kind: "EXAM"; examType: ExamType; overallResult: ExamResult;
      findings: { bodySystem: string; status: ExamFindingStatus }[] }
  | { kind: "MICROCHIP"; chipNumber: string; brand: string | null }
);

export interface MedicalHistoryOutput {
  animal: MedicalOutputAnimal;
  generatedDate: CalendarDay;
  /** The shelter clock's time of day at generation, `"HH:mm"`. */
  generatedTime: string;
  generatedAt: Date;
  summary: { altered: OutputAlteredStatus; chips: MedicalOutputChip[]; rabies: RabiesStatus };
  completedCare: CompletedMedicalOutput[];
  conditions: { type: MedicalConditionType; name: string; status: MedicalConditionStatus;
    onsetDate: CalendarDay | null; resolvedDate: CalendarDay | null }[];
  careEpisodes: { type: CareEpisodeType; startDate: CalendarDay; endDate: CalendarDay | null }[];
  medications: { product: string; doseAmount: number; doseUnit: DoseUnit; route: MedicalRoute;
    frequency: MedicationFrequency; intervalDays: number | null; firstSlot: DoseSlot | null;
    startDate: CalendarDay; endDate: CalendarDay | null; discontinuedDate: CalendarDay | null;
    state: Exclude<OrderState, "VOIDED">; instructions: string | null }[];
  plannedCare: { name: string; dueDate: CalendarDay | null; overdue: boolean }[];
  documents: { name: string; type: Extract<MedicalDocumentType, "LAB_RESULT" | "VET_RECORD" | "IMAGING" | "PRESCRIPTION">;
    documentDate: CalendarDay | null }[];
}

export interface VaccineCredentials {
  veterinarianName: string | null;
  veterinarianLicenseNumber: string | null;
}

/** Incomplete credentials are valid facts; credentials belong to rabies only. */
export const vaccineCredentialsIssue = (credentials: VaccineCredentials, isRabies: boolean): {
  field: keyof VaccineCredentials; message: string;
} | null => {
  if (isRabies) return null;
  const field = credentials.veterinarianName?.trim() ? "veterinarianName"
    : credentials.veterinarianLicenseNumber?.trim() ? "veterinarianLicenseNumber" : null;
  return field ? { field, message: "Veterinarian credentials are only recorded for a rabies vaccine." } : null;
};

/** Raw minimum needed for eligibility, with days parsed at the read boundary. */
export interface RabiesCertificateEntry {
  id: string;
  animalId: string;
  kind: MedicalEntryKind;
  status: MedicalEntryStatus;
  voidedAt: Date | null;
  outcomeId: string | null;
  completedDate: CalendarDay | null;
  vaccine: {
    durationMonths: number | null;
    validUntilDate: CalendarDay | null;
    veterinarianName: string | null;
    veterinarianLicenseNumber: string | null;
  } | null;
}

export type RabiesCertificateEligibility =
  | { available: false; reason: "NOT_FOUND" | "NOT_COMPLETED_RABIES" | "DAY_UNKNOWN" | "VALIDITY_UNKNOWN" | "CREDENTIALS_MISSING"; message: string }
  | { available: true; completedDate: CalendarDay; validUntilDate: CalendarDay;
      veterinarianName: string; veterinarianLicenseNumber: string; expired: boolean };

/** Selected historical entry, stored duration/validity, and inclusive expiry. */
export const rabiesCertificateEligibility = (
  entry: RabiesCertificateEntry | null,
  requested: { animalId: string; entryId: string },
  today: CalendarDay,
): RabiesCertificateEligibility => {
  if (!entry || entry.id !== requested.entryId || entry.animalId !== requested.animalId) {
    return { available: false, reason: "NOT_FOUND", message: "This vaccination record is unavailable for this animal." };
  }
  const vaccine = entry.vaccine;
  if (entry.kind !== "VACCINE" || entry.status !== "COMPLETED" || entry.voidedAt !== null
    || entry.outcomeId !== null || !vaccine || vaccine.durationMonths === null
    || !Number.isInteger(vaccine.durationMonths) || vaccine.durationMonths < 1 || vaccine.durationMonths > 36) {
    return { available: false, reason: "NOT_COMPLETED_RABIES", message: "A certificate requires a completed, non-voided rabies vaccination record." };
  }
  if (!entry.completedDate) {
    return { available: false, reason: "DAY_UNKNOWN", message: "Record the vaccination date before printing a certificate." };
  }
  if (!vaccine.validUntilDate) {
    return { available: false, reason: "VALIDITY_UNKNOWN", message: "The vaccination's valid-until date is not recorded." };
  }
  const veterinarianName = vaccine.veterinarianName?.trim();
  const veterinarianLicenseNumber = vaccine.veterinarianLicenseNumber?.trim();
  if (!veterinarianName || !veterinarianLicenseNumber) {
    return { available: false, reason: "CREDENTIALS_MISSING", message: "Record the veterinarian's name and license number before printing a certificate." };
  }
  return { available: true, completedDate: entry.completedDate, validUntilDate: vaccine.validUntilDate,
    veterinarianName, veterinarianLicenseNumber, expired: vaccine.validUntilDate < today };
};

export interface RabiesCertificateOutput {
  animal: MedicalOutputAnimal;
  generatedDate: CalendarDay;
  /** The shelter clock's time of day at generation, `"HH:mm"`. */
  generatedTime: string;
  generatedAt: Date;
  vaccination: Extract<CompletedMedicalOutput, { kind: "VACCINE" }>;
  certificate: Extract<RabiesCertificateEligibility, { available: true }>;
}

export const rabiesCertificateValidityText = (
  certificate: Extract<RabiesCertificateEligibility, { available: true }>,
  generatedDate: CalendarDay,
): string => certificate.expired
  ? `Expired as of ${formatShelterDay(generatedDate)}. Recorded validity ended ${formatShelterDay(certificate.validUntilDate)}.`
  : `Recorded valid through ${formatShelterDay(certificate.validUntilDate)} (inclusive).`;
