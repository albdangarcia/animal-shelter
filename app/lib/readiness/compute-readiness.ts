/**
 * What is blocking one animal from being adoptable. Pure — the data layer
 * gathers the inputs, this just reasons about them. No stored flag: call it
 * fresh whenever the answer is needed, mirroring the attention-queue
 * projection.
 *
 * Every blocker carries `since`: when the recorded evidence says it began.
 * Nothing about a blocker is stored, so this is read off dates the evidence
 * already has — the start of the current stay, an observation, a deletion,
 * an edit. `null` means nothing in the app dates the onset at all.
 */

import type { AssessmentSignal, AnimalHealthStatus } from "@/prisma/generated/enums";
import { ACUTE_HEALTH_STATUSES } from "../data/animals/attention-queue";
import type { ReadinessRequirement } from "./requirements";

export type CharacteristicClaimIssue =
  /** A live finding on the animal argues against the trait. */
  | "CONTRADICTED"
  /** The assessment that sourced the trait has since been deleted. */
  | "SOURCE_DELETED"
  /** The sourcing assessment's current answers no longer propose the trait
   *  (an edit took it away). */
  | "NO_LONGER_SUPPORTED";

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
  | { kind: "NOT_SPAYED_NEUTERED"; since: Date }
  | {
      kind: "NO_PHOTO";
      /** The start of the current stay. Removing a photo isn't dated, so an
       *  animal whose photos were all removed mid-stay reads as having had
       *  none since arrival. */
      since: Date;
    }
  | {
      kind: "ACUTE_HEALTH";
      healthStatus: AnimalHealthStatus;
      /** Health status changes aren't dated anywhere, so there is no honest
       *  onset to report. */
      since: null;
    };

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
}

export interface ComputeReadinessInputs {
  /** What this animal (by species) needs on file at all. */
  requirements: ReadinessRequirement[];
  /** The animal's live (non-deleted) assessments. */
  assessments: ReadinessAssessment[];
  /** The animal's active characteristic assignments. */
  claims: ReadinessCharacteristicClaim[];
  isSpayedNeutered: boolean;
  hasPhoto: boolean;
  healthStatus: AnimalHealthStatus | null;
  /** When the animal's current stay began (its latest intake). What it needs
   *  from arrival — required checks, a photo, spay/neuter — is due from here. */
  inCareSince: Date;
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
    if (claim.contradictedAt) {
      blocker("CONTRADICTED", claim.contradictedAt);
    }
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
  ];

  if (!inputs.isSpayedNeutered) {
    blockers.push({ kind: "NOT_SPAYED_NEUTERED", since: inputs.inCareSince });
  }
  if (!inputs.hasPhoto) {
    blockers.push({ kind: "NO_PHOTO", since: inputs.inCareSince });
  }
  if (
    inputs.healthStatus &&
    (ACUTE_HEALTH_STATUSES as readonly AnimalHealthStatus[]).includes(
      inputs.healthStatus,
    )
  ) {
    blockers.push({
      kind: "ACUTE_HEALTH",
      healthStatus: inputs.healthStatus,
      since: null,
    });
  }

  return blockers;
}
