import type { AnimalListingStatus } from "@/prisma/generated/enums";
import {
  blockerAction,
  describeBlocker,
  earliestSince,
  orderBlockers,
  type AnimalReadiness,
  type ReadinessBlockerKind,
  type ReadinessViewerCan,
} from "@/app/lib/readiness/board";
import {
  shelterDayKey,
  shelterDaysBetween,
} from "@/app/lib/utils/shelter-day";

/**
 * One item still outstanding on the animal's readiness checklist.
 *
 * Field names avoid "blocked": readiness is advisory — nothing in the app
 * stops an animal with outstanding items from being listed or adopted — and
 * a model repeats the words it is handed.
 */
export type OutstandingItemView = {
  kind: ReadinessBlockerKind;
  /** The same words the readiness board and the animal's panel use. */
  description: string;
  /** The shelter-calendar day it began (`yyyy-MM-dd`); null when nothing in
   *  the app dates it. */
  since: string | null;
  /**
   * Whole shelter-calendar days from `since` to today — 0 means it began
   * today. Null exactly when `since` is.
   *
   * Stated, not implied, for the same reason the attention queue states
   * `overdue`: "outstanding for 34 days" is date arithmetic against the date
   * in the system prompt, which a model gets wrong often enough to matter,
   * and it has no way to know the day boundary is the shelter's rather than
   * UTC.
   */
  daysOutstanding: number | null;
  /** What clears it, worded for what this viewer is allowed to change — the
   *  same label the board's "what clears it" link carries. */
  nextStep: string;
};

type ReadinessIdentity = {
  animalId: string;
  name: string;
  listingStatus: AnimalListingStatus;
};

/**
 * `getAnimalReadiness`'s result.
 *
 * An archived animal (adopted, transferred, deceased) is reported as such
 * with nothing outstanding — the board leaves them out for the same reason.
 * Nothing about an animal that has left can still stand between it and
 * adoption, and a list of items on one reads as work to do.
 */
export type AnimalReadinessView = ReadinessIdentity &
  (
    | { status: "ARCHIVED" }
    | { status: "READY" }
    | {
        status: "NOT_READY";
        /** How long the animal has had anything outstanding: days since its
         *  earliest dated item. Null when none of them is dated. */
        daysOutstanding: number | null;
        /** Most urgent first, in the board's order. */
        outstanding: OutstandingItemView[];
      }
  );

/**
 * The readiness line on `getAnimalSummary`: whether the animal is ready, and
 * if not, how many items are outstanding and for how long — the detail is
 * `getAnimalReadiness`.
 */
export type ReadinessLine =
  | { status: "ARCHIVED" }
  | { status: "READY" }
  | {
      status: "NOT_READY";
      outstandingCount: number;
      daysOutstanding: number | null;
      /** The kinds of item outstanding, most urgent first, each once. */
      kinds: ReadinessBlockerKind[];
    };

/**
 * `now` is a parameter rather than a `new Date()` inside, so day counts are a
 * pure function of their inputs and can be tested without freezing a clock.
 */
export function toAnimalReadinessView(
  readiness: AnimalReadiness,
  can: ReadinessViewerCan,
  now: Date,
  timezone: string,
): AnimalReadinessView {
  const { animal, blockers } = readiness;
  const identity: ReadinessIdentity = {
    animalId: animal.id,
    name: animal.name,
    listingStatus: animal.listingStatus,
  };

  if (animal.listingStatus === "ARCHIVED") {
    return { ...identity, status: "ARCHIVED" };
  }
  if (blockers.length === 0) {
    return { ...identity, status: "READY" };
  }

  const since = earliestSince(blockers);
  return {
    ...identity,
    status: "NOT_READY",
    daysOutstanding: since ? shelterDaysBetween(since, now, timezone) : null,
    outstanding: orderBlockers(blockers).map((blocker) => ({
      kind: blocker.kind,
      description: describeBlocker(blocker, timezone),
      since: blocker.since ? shelterDayKey(blocker.since, timezone) : null,
      daysOutstanding: blocker.since
        ? shelterDaysBetween(blocker.since, now, timezone)
        : null,
      nextStep: blockerAction(blocker, animal.id, can).label,
    })),
  };
}

export function toReadinessLine(
  readiness: AnimalReadiness,
  now: Date,
  timezone: string,
): ReadinessLine {
  const { animal, blockers } = readiness;
  if (animal.listingStatus === "ARCHIVED") return { status: "ARCHIVED" };
  if (blockers.length === 0) return { status: "READY" };

  const since = earliestSince(blockers);
  return {
    status: "NOT_READY",
    outstandingCount: blockers.length,
    daysOutstanding: since ? shelterDaysBetween(since, now, timezone) : null,
    kinds: [...new Set(orderBlockers(blockers).map((b) => b.kind))],
  };
}
