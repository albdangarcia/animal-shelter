// Whether an animal is spayed or neutered, worked out from its medical record
// when someone looks. Nothing stores the answer: a spay recorded, voided or
// corrected changes it at once, and an exemption lapses on its own when its
// review day has passed.

import {
  MedicalEntryStatus,
  Sex,
  SurgeryProcedure,
  type SpayNeuterExemptionReason,
} from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

/**
 * One of the animal's spay or neuter entries that isn't voided: given,
 * scheduled, or declined as an exemption.
 */
export interface SpayNeuterEntry {
  id: string;
  status: MedicalEntryStatus;
  procedure: SurgeryProcedure;
  completedDate: string | null;
  exemptionReason: SpayNeuterExemptionReason | null;
  declineReason: string | null;
  reviewDate: string | null;
  /**
   * When the entry reached its current state. An exemption is never changed
   * once written, so this is when it was declined, even when the spay was
   * scheduled long before.
   */
  updatedAt: Date;
}

export type SpayNeuterStatus =
  | {
      status: "ALTERED";
      entryId: string;
      procedure: SurgeryProcedure;
      /** Null when it was done before intake on a day nobody knows. */
      completedDate: CalendarDay | null;
    }
  | {
      status: "EXEMPT";
      entryId: string;
      reason: SpayNeuterExemptionReason;
      /** Null when the exemption holds until it is voided. */
      reviewDate: CalendarDay | null;
    }
  | {
      status: "UNKNOWN";
      /**
       * The review day of the exemption that lapsed last, if one did: the
       * animal has needed a spay or neuter since the day after it.
       */
      lapsedOn: CalendarDay | null;
    };

const isExemption = (entry: SpayNeuterEntry) =>
  entry.status === MedicalEntryStatus.DECLINED && entry.exemptionReason !== null;

const latestFirst = (a: SpayNeuterEntry, b: SpayNeuterEntry) =>
  b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1);

/**
 * The animal's spay/neuter status on `today`, from its spay and neuter
 * entries that aren't voided:
 * - **Altered**: a spay or neuter was given, from any source. It beats an
 *   exemption. Of several, the one given last (an unknown day counts as
 *   earliest).
 * - **Exempt**: an exemption holds, because it has no review day or its
 *   review day is today or later. Of several, the one that holds longest.
 * - **Unknown**: neither.
 */
export const spayNeuterStatus = (
  entries: SpayNeuterEntry[],
  today: CalendarDay,
): SpayNeuterStatus => {
  const given = entries
    .filter((entry) => entry.status === MedicalEntryStatus.COMPLETED)
    .sort(
      (a, b) =>
        (b.completedDate ?? "").localeCompare(a.completedDate ?? "") ||
        latestFirst(a, b),
    )[0];
  if (given) {
    return {
      status: "ALTERED",
      entryId: given.id,
      procedure: given.procedure,
      completedDate: parseCalendarDay(given.completedDate),
    };
  }

  const exemptions = entries.filter(isExemption);
  const holding = exemptions
    .filter((entry) => entry.reviewDate === null || entry.reviewDate >= today)
    // No review day holds longest; then the latest review day.
    .sort(
      (a, b) =>
        (b.reviewDate ?? "9999-12-31").localeCompare(a.reviewDate ?? "9999-12-31") ||
        latestFirst(a, b),
    )[0];
  if (holding) {
    return {
      status: "EXEMPT",
      entryId: holding.id,
      reason: holding.exemptionReason!,
      reviewDate: parseCalendarDay(holding.reviewDate),
    };
  }

  const lapsedOn = exemptions
    .map((entry) => entry.reviewDate)
    .filter((day): day is string => day !== null)
    .sort()
    .at(-1);
  return { status: "UNKNOWN", lapsedOn: parseCalendarDay(lapsedOn ?? null) };
};

/**
 * The exemption that is open for review, or null. An exemption with a review
 * day is open until something replaces it on the animal's record: a spay or
 * neuter given (at any time), or a spay or neuter scheduled or another
 * exemption written after it. An exemption with no review day is never
 * reviewed. Whether the review day has come is left to whoever lists it,
 * as for a due day.
 */
export const openExemptionReview = (
  entries: SpayNeuterEntry[],
): SpayNeuterEntry | null => {
  if (entries.some((entry) => entry.status === MedicalEntryStatus.COMPLETED)) {
    return null;
  }
  const latest = entries
    .filter(
      (entry) =>
        isExemption(entry) || entry.status === MedicalEntryStatus.SCHEDULED,
    )
    .sort(latestFirst)[0];
  return latest && isExemption(latest) && latest.reviewDate !== null ? latest : null;
};

/**
 * Why a procedure doesn't suit an animal of this sex, or null when it does. A
 * spay is for a female and a neuter for a male; an animal whose sex isn't
 * known can have either, and every other procedure suits any animal.
 */
export const procedureSexIssue = (
  procedure: SurgeryProcedure,
  sex: Sex,
): string | null => {
  if (procedure === SurgeryProcedure.SPAY && sex === Sex.MALE) {
    return "A spay is for a female, and this animal is male.";
  }
  if (procedure === SurgeryProcedure.NEUTER && sex === Sex.FEMALE) {
    return "A neuter is for a male, and this animal is female.";
  }
  return null;
};

/** The procedures that suit an animal of this sex, in the order pickers list
 * them. */
export const proceduresFor = (sex: Sex): SurgeryProcedure[] =>
  Object.values(SurgeryProcedure).filter(
    (procedure) => !procedureSexIssue(procedure, sex),
  );
