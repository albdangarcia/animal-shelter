/**
 * What is blocking one animal from being adoptable. Pure — the data layer
 * gathers the inputs, this just reasons about them. No stored flag: call it
 * fresh whenever the answer is needed, mirroring the attention-queue
 * projection.
 *
 * Every blocker carries `since`: when the recorded evidence says it began.
 * Nothing about a blocker is stored, so this is read off dates the evidence
 * already has — the start of the current stay, an observation, a deletion,
 * an edit, the day after a spay/neuter exemption lapsed, the day of an exam,
 * the day a condition resolved or the moment it was voided.
 * `null` means nothing in the app dates the onset at all.
 *
 * The medical record's exams count for the stay they were done in: an
 * intake exam from an earlier stay doesn't stand for this one, and an
 * earlier stay's call for a vet's review doesn't hold this one up. An open
 * care episode holds the animal up from the day it started.
 */

import type {
  AssessmentSignal,
  CareEpisodeType,
  ExamType,
} from "@/prisma/generated/enums";
import type { ReadinessRequirement } from "./requirements";
import type { SpayNeuterStatus } from "../utils/spay-neuter";
import type { OpenCareEpisode } from "../utils/care-status";
import { stayExams, type ExamFact } from "../utils/exams";
import {
  shelterDayKey,
  shiftDayKey,
  startOfShelterDay,
  type CalendarDay,
} from "../utils/shelter-day";

export type CharacteristicClaimIssue =
  /** A live finding on the animal argues against the trait. */
  | "CONTRADICTED"
  /** The assessment that sourced the trait has since been deleted. */
  | "SOURCE_DELETED"
  /** The sourcing assessment's current answers no longer propose the trait
   *  (an edit took it away). */
  | "NO_LONGER_SUPPORTED"
  /** The problem-list condition that sourced the trait has been resolved. */
  | "CONDITION_RESOLVED"
  /** The problem-list condition that sourced the trait has been voided. */
  | "CONDITION_VOIDED";

export type ReadinessBlocker =
  | {
      kind: "MISSING_ASSESSMENT";
      templateKey: string;
      templateName: string;
      /** The start of the current stay — the check was due from arrival. */
      since: Date;
    }
  | {
      kind: "ESCALATED_FINDING";
      assessmentId: string;
      templateName: string;
      observedAt: Date;
      since: Date;
    }
  | {
      kind: "UNSUPPORTED_CHARACTERISTIC";
      characteristicId: string;
      characteristicName: string;
      issue: CharacteristicClaimIssue;
      /** The later of the assignment and the evidence against it — a claim
       *  can't be undermined before it was made. */
      since: Date;
    }
  | {
      kind: "NO_INTAKE_EXAM";
      /** The start of the current stay — the exam was due from arrival. */
      since: Date;
    }
  | {
      kind: "NEEDS_VET_REVIEW";
      /** The stay's latest exam, which asked for the review. */
      entryId: string;
      examType: ExamType;
      examDate: CalendarDay;
      /** The start of that exam's day on the shelter's calendar. */
      since: Date;
    }
  | {
      kind: "NOT_SPAYED_NEUTERED";
      /** The start of the current stay, or the day after an exemption
       *  lapsed when that is later. */
      since: Date;
    }
  | {
      kind: "NO_PHOTO";
      /** The start of the current stay. Removing a photo isn't dated, so an
       *  animal whose photos were all removed mid-stay reads as having had
       *  none since arrival. */
      since: Date;
    }
  | {
      kind: "UNDER_CARE";
      /** The open care episode. */
      episodeId: string;
      episodeType: CareEpisodeType;
      startDate: CalendarDay;
      /** The clinic, for a stay off site or vet care that names one. */
      partnerName: string | null;
      /** The start of the episode's first day on the shelter's calendar. */
      since: Date;
    };

/** One of the animal's completed, unvoided exams, from any stay. */
export type ReadinessExam = ExamFact;

/** One recorded, non-deleted assessment, as far as readiness cares. */
export interface ReadinessAssessment {
  id: string;
  templateKey: string;
  templateName: string;
  observedAt: Date;
  signal: AssessmentSignal;
}

/**
 * One of the animal's active characteristic assignments and the problems
 * live evidence has with it — the same three states the Characteristics tab
 * warns about, computed fresh from the same live data. A trait can carry
 * more than one at once (e.g. a deleted source AND a separate live
 * contradiction are different problems, asked about separately). Each
 * problem is a date rather than a flag: null when it doesn't apply.
 */
export interface ReadinessCharacteristicClaim {
  characteristicId: string;
  characteristicName: string;
  assignedAt: Date;
  /** Observed date of the earliest live finding against the trait. */
  contradictedAt: Date | null;
  /** When the citing assessment was deleted. */
  sourceDeletedAt: Date | null;
  /** When the citing assessment was last changed, if its current answers no
   *  longer propose the trait — the edit that took support away can't be
   *  later than that. Ignored when `sourceDeletedAt` is set: a deleted
   *  source's current answers aren't a separate thing to report. */
  supportLostAt: Date | null;
  /** When the citing condition was voided. */
  conditionVoidedAt: Date | null;
  /** The start of the day the citing condition resolved, on the shelter's
   *  calendar. Ignored when `conditionVoidedAt` is set: a voided condition
   *  counts for nothing, resolved or not. */
  conditionResolvedAt: Date | null;
}

export interface ComputeReadinessInputs {
  /** What this animal (by species) needs on file at all. */
  requirements: ReadinessRequirement[];
  /** The animal's live (non-deleted) assessments. */
  assessments: ReadinessAssessment[];
  /** The animal's active characteristic assignments. */
  claims: ReadinessCharacteristicClaim[];
  /** From the medical record: no spay or neuter given and no exemption in
   *  force reads as UNKNOWN, or as INTACT when the latest exam to look found
   *  the animal intact. Both block, dated the same way. */
  spayNeuter: SpayNeuterStatus;
  /** Every completed, unvoided exam on the animal's medical record. Only
   *  those dated on or after the stay's first day (`inCareSince` on the
   *  shelter's calendar) count. */
  exams: ReadinessExam[];
  hasPhoto: boolean;
  /** The animal's open care episode, if it is under care. */
  openEpisode: OpenCareEpisode | null;
  /** When the animal's current stay began (its latest intake). What it needs
   *  from arrival — required checks, a photo, spay/neuter — is due from here. */
  inCareSince: Date;
  /** The shelter's timezone, to read a lapsed exemption's day as an instant. */
  timezone: string;
}

const laterOf = (a: Date, b: Date): Date => (a > b ? a : b);

function missingAssessmentBlockers(
  requirements: ReadinessRequirement[],
  assessments: ReadinessAssessment[],
  inCareSince: Date,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  for (const requirement of requirements) {
    const hasMatch = assessments.some(
      (a) => a.templateKey === requirement.templateKey,
    );
    if (!hasMatch) {
      blockers.push({
        kind: "MISSING_ASSESSMENT",
        templateKey: requirement.templateKey,
        templateName: requirement.templateName,
        since: inCareSince,
      });
    }
  }
  return blockers;
}

/**
 * A signal is a read of current state, not a permanent mark — a resolved
 * concern shouldn't block forever. Only the most-recently-observed assessment
 * of a given template speaks for it; an old `ESCALATE` that a later, calmer
 * check of the same template superseded no longer counts. Templates without
 * a later check keep whatever their one assessment says.
 */
function escalatedFindingBlockers(
  assessments: ReadinessAssessment[],
): ReadinessBlocker[] {
  const latestByTemplate = new Map<string, ReadinessAssessment>();
  for (const assessment of assessments) {
    const current = latestByTemplate.get(assessment.templateKey);
    if (!current || assessment.observedAt > current.observedAt) {
      latestByTemplate.set(assessment.templateKey, assessment);
    }
  }
  return [...latestByTemplate.values()]
    .filter((a) => a.signal === "ESCALATE")
    .sort((a, b) => a.templateKey.localeCompare(b.templateKey))
    .map((a) => ({
      kind: "ESCALATED_FINDING" as const,
      assessmentId: a.id,
      templateName: a.templateName,
      observedAt: a.observedAt,
      since: a.observedAt,
    }));
}

function characteristicClaimBlockers(
  claims: ReadinessCharacteristicClaim[],
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  for (const claim of claims) {
    const blocker = (issue: CharacteristicClaimIssue, evidenceAt: Date) =>
      blockers.push({
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: claim.characteristicId,
        characteristicName: claim.characteristicName,
        issue,
        since: laterOf(claim.assignedAt, evidenceAt),
      });

    if (claim.sourceDeletedAt) {
      blocker("SOURCE_DELETED", claim.sourceDeletedAt);
    } else if (claim.supportLostAt) {
      blocker("NO_LONGER_SUPPORTED", claim.supportLostAt);
    }
    if (claim.conditionVoidedAt) {
      blocker("CONDITION_VOIDED", claim.conditionVoidedAt);
    } else if (claim.conditionResolvedAt) {
      blocker("CONDITION_RESOLVED", claim.conditionResolvedAt);
    }
    if (claim.contradictedAt) {
      blocker("CONTRADICTED", claim.contradictedAt);
    }
  }
  return blockers;
}

/**
 * The stay needs an intake exam, and its latest exam of any type speaks for
 * the animal now: one that asked for a vet's review holds it up until a
 * later exam says otherwise. "Needs treatment" doesn't: the treatment is
 * recorded as care.
 */
function examBlockers(
  exams: ReadinessExam[],
  inCareSince: Date,
  timezone: string,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  const thisStay = stayExams(exams, shelterDayKey(inCareSince, timezone));
  if (!thisStay.some((exam) => exam.examType === "INTAKE")) {
    blockers.push({ kind: "NO_INTAKE_EXAM", since: inCareSince });
  }
  const latest = thisStay[0];
  if (latest?.overallResult === "NEEDS_VET_REVIEW") {
    blockers.push({
      kind: "NEEDS_VET_REVIEW",
      entryId: latest.entryId,
      examType: latest.examType,
      examDate: latest.completedDate,
      since: startOfShelterDay(latest.completedDate, timezone),
    });
  }
  return blockers;
}

export function computeReadiness(
  inputs: ComputeReadinessInputs,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [
    ...missingAssessmentBlockers(
      inputs.requirements,
      inputs.assessments,
      inputs.inCareSince,
    ),
    ...escalatedFindingBlockers(inputs.assessments),
    ...characteristicClaimBlockers(inputs.claims),
    ...examBlockers(inputs.exams, inputs.inCareSince, inputs.timezone),
  ];

  if (
    inputs.spayNeuter.status === "UNKNOWN" ||
    inputs.spayNeuter.status === "INTACT"
  ) {
    // An exemption covered the animal up to and including its review day, so
    // the need starts the day after — unless that was before this stay.
    const { lapsedOn } = inputs.spayNeuter;
    blockers.push({
      kind: "NOT_SPAYED_NEUTERED",
      since: lapsedOn
        ? laterOf(
            inputs.inCareSince,
            startOfShelterDay(shiftDayKey(lapsedOn, 1), inputs.timezone),
          )
        : inputs.inCareSince,
    });
  }
  if (!inputs.hasPhoto) {
    blockers.push({ kind: "NO_PHOTO", since: inputs.inCareSince });
  }
  if (inputs.openEpisode) {
    const { id, type, startDate, clinicName } = inputs.openEpisode;
    blockers.push({
      kind: "UNDER_CARE",
      episodeId: id,
      episodeType: type,
      startDate,
      partnerName: clinicName,
      since: startOfShelterDay(startDate, inputs.timezone),
    });
  }

  return blockers;
}
