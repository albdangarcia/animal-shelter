// Whether an animal is spayed or neutered, worked out from its medical record
// when someone looks. Nothing stores the answer: a spay recorded, voided or
// corrected changes it at once, and an exemption lapses on its own when its
// review day has passed. The status is one of four, in this order: Altered (a
// spay or neuter was done), Exempt (an exemption holds), Intact (the latest
// exam to look found the animal intact) and Unknown (none of these).

import {
  MedicalEntryStatus,
  ReproductiveStatus,
  Sex,
  SurgeryProcedure,
  type SpayNeuterExemptionReason,
} from "@/prisma/generated/enums";
import {
  formatShelterDay,
  parseCalendarDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { ReproductiveFinding } from "@/app/lib/utils/exams";
import { SURGERY_PROCEDURE_LABELS } from "@/app/lib/constants/medical";

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
      status: "INTACT";
      /** The exam that found it intact, and its day. */
      examEntryId: string;
      examDate: CalendarDay;
      /** As for Unknown: the animal still needs a spay or neuter. */
      lapsedOn: CalendarDay | null;
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
 * entries that aren't voided, and what its latest exam to look found
 * (`reproductive`):
 * - **Altered**: a spay or neuter was given, from any source. It beats an
 *   exemption. Of several, the one given last (an unknown day counts as
 *   earliest).
 * - **Exempt**: an exemption holds, because it has no review day or its
 *   review day is today or later. Of several, the one that holds longest.
 * - **Intact**: neither, and the latest exam that recorded a reproductive
 *   status found the animal intact. An exam that found it altered or
 *   couldn't tell leaves it Unknown: only a surgery entry makes an animal
 *   Altered.
 * - **Unknown**: none of these.
 *
 * Callers that only ask whether the animal is altered can leave
 * `reproductive` out.
 */
export const spayNeuterStatus = (
  entries: SpayNeuterEntry[],
  today: CalendarDay,
  reproductive: ReproductiveFinding | null = null,
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

  const lapsedOn = parseCalendarDay(
    exemptions
      .map((entry) => entry.reviewDate)
      .filter((day): day is string => day !== null)
      .sort()
      .at(-1) ?? null,
  );
  if (reproductive?.status === ReproductiveStatus.INTACT) {
    return {
      status: "INTACT",
      examEntryId: reproductive.entryId,
      examDate: reproductive.examDate,
      lapsedOn,
    };
  }
  return { status: "UNKNOWN", lapsedOn };
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

/** A spay or neuter on the animal's record, which another one would repeat. */
export interface SpayNeuterHeld {
  entryId: string;
  procedure: SurgeryProcedure;
  /** The day it was given, or is due. Null for one given on a day nobody knows. */
  day: CalendarDay | null;
}

/**
 * The spay or neuter on an animal's record, neither voided: the one given, and
 * the one scheduled. A spay and a neuter are one surgery here, so either holds
 * the place of both.
 */
export interface SpayNeuterOnRecord {
  given: SpayNeuterHeld | null;
  scheduled: SpayNeuterHeld | null;
}

export const isSpayOrNeuter = (procedure: SurgeryProcedure | null | undefined) =>
  procedure === SurgeryProcedure.SPAY || procedure === SurgeryProcedure.NEUTER;

/**
 * What a surgery picker offers: the procedures that suit the animal's sex,
 * without spay and neuter when the record already holds one, and the entry
 * that holds it. One given holds it, unless it is `entryId`, the entry being
 * corrected; when `scheduling`, one scheduled holds it too. The procedure
 * already on the entry, `own`, stays on offer when only the sex rule would
 * drop it: the animal's sex may have been corrected since.
 */
export const surgeryProcedureChoices = (
  sex: Sex,
  onRecord: SpayNeuterOnRecord,
  {
    scheduling = false,
    entryId,
    own,
  }: { scheduling?: boolean; entryId?: string; own?: SurgeryProcedure | null } = {},
): {
  procedures: SurgeryProcedure[];
  heldBy: (SpayNeuterHeld & { status: "given" | "scheduled" }) | null;
} => {
  const given = onRecord.given?.entryId === entryId ? null : onRecord.given;
  const heldBy = given
    ? { ...given, status: "given" as const }
    : scheduling && onRecord.scheduled
      ? { ...onRecord.scheduled, status: "scheduled" as const }
      : null;
  const procedures = proceduresFor(sex);
  if (own && !procedures.includes(own)) procedures.unshift(own);
  return {
    procedures: heldBy
      ? procedures.filter((procedure) => !isSpayOrNeuter(procedure))
      : procedures,
    heldBy,
  };
};

/** "spayed" or "neutered": what a spay or neuter leaves the animal. */
export const ALTERED_WORDS: Partial<Record<SurgeryProcedure, string>> = {
  SPAY: "spayed",
  NEUTER: "neutered",
};

const noun = (procedure: SurgeryProcedure) =>
  SURGERY_PROCEDURE_LABELS[procedure].toLowerCase();

/**
 * What to do with a spay or neuter appointment once the surgery is on the
 * record, as the entry service's refusals and the surgery form both say it.
 */
export const voidAppointmentInstead = (procedure: SurgeryProcedure) =>
  `Void this scheduled ${noun(procedure)} instead.`;

/**
 * Why a surgery picker leaves spay and neuter out, from what
 * `surgeryProcedureChoices` found holds the place. `planned` is the procedure
 * of the appointment being recorded as given, if one is: a spay or neuter
 * appointment is voided once the surgery is on the record.
 */
export const spayNeuterHeldText = (
  heldBy: SpayNeuterHeld & { status: "given" | "scheduled" },
  planned?: SurgeryProcedure | null,
): string => {
  if (heldBy.status === "scheduled") {
    return `A ${noun(heldBy.procedure)} is already scheduled for ${heldBy.day ? formatShelterDay(heldBy.day) : "this animal"}, so spay and neuter aren't offered. Reschedule that one instead.`;
  }
  const when = heldBy.day ? formatShelterDay(heldBy.day) : "date unknown";
  const already = `Already ${ALTERED_WORDS[heldBy.procedure]} on its record (${when})`;
  return isSpayOrNeuter(planned)
    ? `${already}. ${voidAppointmentInstead(planned!)}`
    : `${already}, so spay and neuter aren't offered. Correct that entry, or record a follow-up surgery as Other.`;
};
