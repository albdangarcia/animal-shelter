// Pure application-status derivation — no Prisma client import, so it is
// trivially unit-testable and reusable. This is the SINGLE SOURCE OF TRUTH for
// an adoption application's effective status: whether it was adopted, or closed
// because the animal left, is derived from the animal's Outcome events, never
// stored.
//
// An application's status mixes two kinds of fact. PENDING through WITHDRAWN
// are decisions: someone chose each one, and they are what the status column
// holds. ADOPTED and CLOSED are consequences: nobody chooses them, an Outcome
// recorded elsewhere causes them. Storing one would copy a relation that sits
// right next to it, and a copy can disagree with what it copies. Deriving it
// cannot.

import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";

// The statuses an Outcome causes. The status column never holds them.
export const ApplicationConsequence = {
  ADOPTED: "ADOPTED",
  CLOSED: "CLOSED",
} as const;

export type ApplicationConsequence =
  (typeof ApplicationConsequence)[keyof typeof ApplicationConsequence];

// What an adoption application effectively is: its review decision, unless an
// outcome has adopted or closed it. This is the status every screen shows and
// every rule tests; `ApplicationStatus` alone is only what the column holds.
export const EffectiveApplicationStatus = {
  ...ApplicationStatus,
  ...ApplicationConsequence,
} as const;

export type EffectiveApplicationStatus =
  | ApplicationStatus
  | ApplicationConsequence;

// A row read from the database, carrying its effective status in place of the
// column's.
export type WithEffectiveStatus<Row extends { status: ApplicationStatus }> =
  Omit<Row, "status"> & { status: EffectiveApplicationStatus };

export const isReviewStatus = (
  status: EffectiveApplicationStatus,
): status is ApplicationStatus =>
  status !== ApplicationConsequence.ADOPTED &&
  status !== ApplicationConsequence.CLOSED;

// The review decisions an Outcome does not override: staff rejected the
// application or the applicant withdrew it, and the animal leaving afterwards
// changes neither. Every other review status is still open, and an outcome
// closes it.
const SETTLED_REVIEW_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
]);

export type DerivationApplication = {
  id: string;
  reviewStatus: ApplicationStatus;
  submittedAt: Date;
};

// One of the animal's outcomes, as the derivation needs it. `reversed` is true
// for an outcome that has been voided; a voided outcome adopts nothing and
// closes nothing, as though it had never been recorded.
export type DerivationOutcome = {
  createdAt: Date;
  type: OutcomeType;
  adoptionApplicationId: string | null;
  reversed: boolean;
};

/**
 * The status an adoption application effectively has, given its own review
 * status and every outcome recorded for its animal.
 *
 *  1. ADOPTED iff some live adoption outcome links to this application. A
 *     reversed one does not count, so voiding the adoption un-adopts the
 *     application with nothing to rewrite.
 *  2. Otherwise a settled review decision (REJECTED, WITHDRAWN) stands.
 *  3. Otherwise CLOSED iff some live outcome for the animal was recorded at or
 *     after the moment this application was submitted: the animal left while
 *     it was open.
 *  4. Otherwise the review status, unchanged.
 *
 * "Recorded after" compares the outcome's `createdAt`, never its
 * `outcomeDate`. The question is whether the application was open when the
 * outcome was written into the record — that is when anything open was closed
 * — and `outcomeDate` answers a different one, the day the animal left:
 *  - it is a calendar day and `submittedAt` is an instant, so an application
 *    and an outcome on the same day cannot be ordered by it;
 *  - it can be corrected in place, and a date correction must not flip
 *    applications between closed and open;
 *  - it can be earlier than the day the outcome was entered. An animal adopted
 *    on the 1st but recorded on the 10th stayed listed in between, and an
 *    application submitted on the 5th was open when the adoption was recorded,
 *    so it is closed; by `outcomeDate` it would read as open, for an animal
 *    already gone.
 * `createdAt` is set when the outcome is recorded and never edited.
 *
 * "At or after", because with a clock that only moves forward a tie means the
 * application came first. Submitting refuses an animal that is not listed,
 * and recording an outcome unlists it, both behind the animal's row lock. An
 * application submitted after the outcome was recorded had to wait for the
 * animal to come back and be listed again, so it shares the outcome's
 * millisecond only if the clock was wound back by that whole interval to the
 * millisecond. Both timestamps come from the application's clock as each row
 * is written, so the derivation is only as good as that clock.
 *
 * Anchoring on the order of two recorded events, rather than on whether the
 * animal is in care now, is what keeps a re-intake from reviving old
 * applications: the outcome was still recorded after an old application was
 * submitted, so that application stays closed after the animal comes back,
 * while one submitted after the return has no outcome after it and is live.
 * That is the rule the apply gates already follow: CLOSED does not block
 * applying again, so a closed applicant re-applies rather than having the old
 * application brought back.
 */
export function deriveApplicationStatus(
  application: DerivationApplication,
  outcomes: readonly DerivationOutcome[],
): EffectiveApplicationStatus {
  return (
    deriveApplicationConsequence(application, outcomes)?.status ??
    application.reviewStatus
  );
}

/**
 * `deriveApplicationStatus` for many applications at once, keyed by id, given
 * the outcomes of every animal they belong to.
 */
export function deriveApplicationStatuses(
  applications: readonly {
    id: string;
    animalId: string;
    status: ApplicationStatus;
    submittedAt: Date;
  }[],
  outcomes: readonly (DerivationOutcome & { animalId: string })[],
): Map<string, EffectiveApplicationStatus> {
  const outcomesByAnimal = new Map<string, DerivationOutcome[]>();
  for (const outcome of outcomes) {
    const list = outcomesByAnimal.get(outcome.animalId) ?? [];
    list.push(outcome);
    outcomesByAnimal.set(outcome.animalId, list);
  }

  return new Map(
    applications.map((application) => [
      application.id,
      deriveApplicationStatus(
        {
          id: application.id,
          reviewStatus: application.status,
          submittedAt: application.submittedAt,
        },
        outcomesByAnimal.get(application.animalId) ?? [],
      ),
    ]),
  );
}

/**
 * The consequence an outcome has for this application, and which outcome it
 * was, or null if the review status stands. The same rule as
 * `deriveApplicationStatus`, for a reader that has to say what happened as
 * well as what the status is: the status history shows the outcome that
 * adopted or closed an application as the last entry in its timeline.
 *
 * An application closes when the first live outcome recorded at or after its
 * submission is written, so that is the outcome returned. A later one found
 * it already closed. Ties between outcomes go to the one that comes first in
 * `outcomes`, so pass them in a stable order.
 */
export function deriveApplicationConsequence<
  Outcome extends DerivationOutcome,
>(
  application: DerivationApplication,
  outcomes: readonly Outcome[],
): { status: ApplicationConsequence; outcome: Outcome } | null {
  const live = outcomes.filter((outcome) => !outcome.reversed);

  const adoption = live.find(
    (outcome) =>
      outcome.type === OutcomeType.ADOPTION &&
      outcome.adoptionApplicationId === application.id,
  );
  if (adoption) {
    return { status: ApplicationConsequence.ADOPTED, outcome: adoption };
  }

  if (SETTLED_REVIEW_STATUSES.has(application.reviewStatus)) {
    return null;
  }

  const closedBy = live
    .filter(
      (outcome) =>
        outcome.createdAt.getTime() >= application.submittedAt.getTime(),
    )
    .reduce<Outcome | null>(
      (first, outcome) =>
        first === null || outcome.createdAt < first.createdAt ? outcome : first,
      null,
    );
  return closedBy && { status: ApplicationConsequence.CLOSED, outcome: closedBy };
}
