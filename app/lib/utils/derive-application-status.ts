// Pure application-status derivation — no Prisma client import, so it is
// trivially unit-testable and reusable. This is the SINGLE SOURCE OF TRUTH for
// an adoption application's effective status: whether it was adopted, or closed
// because the animal left, is derived from the animal's Outcome events, never
// read from a stored consequence.
//
// An application's status mixes two kinds of fact. PENDING through WITHDRAWN
// are decisions: someone chose each one. ADOPTED and CLOSED are consequences:
// nobody chooses them, an Outcome recorded elsewhere causes them. A stored
// consequence is a copy of a relation that sits right next to it, and a copy
// can disagree with what it copies. Deriving it cannot.

import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";

// The statuses someone decides. What an application's own status column
// means once the consequences are derived rather than stored.
export type ReviewStatus = Exclude<
  ApplicationStatus,
  typeof ApplicationStatus.ADOPTED | typeof ApplicationStatus.CLOSED
>;

export const isReviewStatus = (
  status: ApplicationStatus,
): status is ReviewStatus =>
  status !== ApplicationStatus.ADOPTED && status !== ApplicationStatus.CLOSED;

/**
 * The review decision to derive from, given what the status column holds.
 *
 * The outcome cascade still writes ADOPTED and CLOSED onto the column, over
 * the decision that was there. Neither loss matters to the derivation:
 *  - ADOPTED only ever replaced APPROVED. Both paths that record an adoption
 *    refuse an application that is not approved, or that belongs to another
 *    animal, so the adoption outcome that set it is among its own animal's
 *    outcomes and derives ADOPTED again. A row written before that refusal
 *    existed may not.
 *  - CLOSED replaced whichever open status the application had, and every open
 *    status derives the same way: the outcome that closed it was recorded
 *    after the application was submitted, so the derivation closes it again
 *    whichever open status stands in here.
 * Only feed this to `deriveApplicationStatus`. It is not the decision staff
 * made, and never something to show. Once the column holds only decisions, a
 * stored status is its own review status and this goes.
 */
export function reviewStatusOf(stored: ApplicationStatus): ReviewStatus {
  if (stored === ApplicationStatus.ADOPTED) return ApplicationStatus.APPROVED;
  if (stored === ApplicationStatus.CLOSED) return ApplicationStatus.PENDING;
  return stored;
}

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
  reviewStatus: ReviewStatus;
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
 *  3. Otherwise CLOSED iff some live outcome for the animal was recorded after
 *     this application was submitted: the animal left while it was open.
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
 * `createdAt` is written by the database and never edited.
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
): ApplicationStatus {
  const live = outcomes.filter((outcome) => !outcome.reversed);

  if (
    live.some(
      (outcome) =>
        outcome.type === OutcomeType.ADOPTION &&
        outcome.adoptionApplicationId === application.id,
    )
  ) {
    return ApplicationStatus.ADOPTED;
  }

  if (SETTLED_REVIEW_STATUSES.has(application.reviewStatus)) {
    return application.reviewStatus;
  }

  if (
    live.some(
      (outcome) =>
        outcome.createdAt.getTime() > application.submittedAt.getTime(),
    )
  ) {
    return ApplicationStatus.CLOSED;
  }

  return application.reviewStatus;
}
