/**
 * What is blocking one animal from being adoptable. Pure — the data layer
 * gathers the inputs, this just reasons about them. No stored flag: call it
 * fresh whenever the answer is needed, mirroring the attention-queue
 * projection.
 *
 * `now` is a parameter rather than a `new Date()` inside, so "is this check
 * stale" is a pure function of its inputs and testable without freezing a
 * clock.
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
  | { kind: "MISSING_ASSESSMENT"; templateKey: string; templateName: string }
  | {
      kind: "STALE_ASSESSMENT";
      templateKey: string;
      templateName: string;
      lastObservedAt: Date;
      maxAgeDays: number;
    }
  | {
      kind: "ESCALATED_FINDING";
      assessmentId: string;
      templateName: string;
      observedAt: Date;
    }
  | {
      kind: "UNSUPPORTED_CHARACTERISTIC";
      characteristicId: string;
      characteristicName: string;
      issue: CharacteristicClaimIssue;
    }
  | { kind: "NOT_SPAYED_NEUTERED" }
  | { kind: "NO_PHOTO" }
  | { kind: "ACUTE_HEALTH"; healthStatus: AnimalHealthStatus };

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
 * contradiction are different problems, asked about separately).
 */
export interface ReadinessCharacteristicClaim {
  characteristicId: string;
  characteristicName: string;
  contradicted: boolean;
  sourceDeleted: boolean;
  /** Ignored when `sourceDeleted` is true — a deleted source's current
   *  answers aren't a separate thing to report. */
  noLongerSupports: boolean;
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
}

/** Deterministic "most recent" pick: later `observedAt` wins, an exact tie
 *  breaks on `id` so the result never depends on input order. */
function latestOf<T extends { id: string; observedAt: Date }>(rows: T[]): T {
  return rows.reduce((latest, row) => {
    const byDate = row.observedAt.getTime() - latest.observedAt.getTime();
    if (byDate > 0 || (byDate === 0 && row.id > latest.id)) return row;
    return latest;
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function missingOrStaleBlockers(
  requirements: ReadinessRequirement[],
  assessments: ReadinessAssessment[],
  now: Date,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  for (const requirement of requirements) {
    const matches = assessments.filter(
      (a) => a.templateKey === requirement.templateKey,
    );
    if (matches.length === 0) {
      blockers.push({
        kind: "MISSING_ASSESSMENT",
        templateKey: requirement.templateKey,
        templateName: requirement.templateName,
      });
      continue;
    }
    if (requirement.maxAgeDays === undefined) continue;

    const latest = latestOf(matches);
    const ageDays = (now.getTime() - latest.observedAt.getTime()) / MS_PER_DAY;
    if (ageDays > requirement.maxAgeDays) {
      blockers.push({
        kind: "STALE_ASSESSMENT",
        templateKey: requirement.templateKey,
        templateName: requirement.templateName,
        lastObservedAt: latest.observedAt,
        maxAgeDays: requirement.maxAgeDays,
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
    }));
}

function characteristicClaimBlockers(
  claims: ReadinessCharacteristicClaim[],
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  for (const claim of claims) {
    if (claim.sourceDeleted) {
      blockers.push({
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: claim.characteristicId,
        characteristicName: claim.characteristicName,
        issue: "SOURCE_DELETED",
      });
    } else if (claim.noLongerSupports) {
      blockers.push({
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: claim.characteristicId,
        characteristicName: claim.characteristicName,
        issue: "NO_LONGER_SUPPORTED",
      });
    }
    if (claim.contradicted) {
      blockers.push({
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: claim.characteristicId,
        characteristicName: claim.characteristicName,
        issue: "CONTRADICTED",
      });
    }
  }
  return blockers;
}

export function computeReadiness(
  inputs: ComputeReadinessInputs,
  now: Date = new Date(),
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [
    ...missingOrStaleBlockers(inputs.requirements, inputs.assessments, now),
    ...escalatedFindingBlockers(inputs.assessments),
    ...characteristicClaimBlockers(inputs.claims),
  ];

  if (!inputs.isSpayedNeutered) blockers.push({ kind: "NOT_SPAYED_NEUTERED" });
  if (!inputs.hasPhoto) blockers.push({ kind: "NO_PHOTO" });
  if (
    inputs.healthStatus &&
    (ACUTE_HEALTH_STATUSES as readonly AnimalHealthStatus[]).includes(
      inputs.healthStatus,
    )
  ) {
    blockers.push({ kind: "ACUTE_HEALTH", healthStatus: inputs.healthStatus });
  }

  return blockers;
}
