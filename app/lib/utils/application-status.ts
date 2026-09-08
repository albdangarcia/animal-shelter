import { ApplicationStatus } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "./enum-formatter";

// Shared by adoption and foster application status-change actions so both
// enforce the same pipeline instead of accepting any status change.
//
// WAITLISTED is grouped with PENDING/REVIEWING as a non-terminal "in
// progress" state — other in-progress states can move into it, and from
// it the application can only move forward to APPROVED or off to
// REJECTED/WITHDRAWN (never back to PENDING/REVIEWING).
//
// REJECTED/WITHDRAWN are terminal *with respect to staff transitions*:
// staff cannot walk an application back out of either. The applicant's own
// `reactivateMyAdoptionApplication` is the documented exception and the sole
// recovery path from WITHDRAWN — it moves the application back to PENDING
// without going through this map. There is no equivalent recovery from
// REJECTED. APPROVED is reversible only to the two terminal states — that's
// the "approved applicant backs out" path (adoption additionally releases the
// animal back to PUBLISHED).
//
// ADOPTED and CLOSED are never set through these actions (the outcome
// cascade sets both), so they have no outgoing transitions here.
export const ALLOWED_APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  [ApplicationStatus.PENDING]: [
    ApplicationStatus.REVIEWING,
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.REVIEWING]: [
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.WAITLISTED]: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.APPROVED]: [
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.WITHDRAWN]: [],
  [ApplicationStatus.ADOPTED]: [],
  [ApplicationStatus.CLOSED]: [],
};

// The statuses that stop this person applying for this animal again.
//
// CLOSED is the one status that does not: it means the animal left the
// shelter while the application was open, which is not a judgment on the
// applicant, so if the animal comes back and is republished they are free to
// apply again. REJECTED still blocks — a staff rejection is a decision, and
// re-applying is not the way to appeal it. Flip that by removing REJECTED
// from this list; every apply gate reads it.
export const BLOCKING_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ADOPTED,
];

export const isAllowedTransition = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean => ALLOWED_APPLICATION_TRANSITIONS[from].includes(to);

export const illegalTransitionMessage = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): string =>
  `Cannot change a${/^[aeiou]/i.test(from) ? "n" : ""} ${formatSingleEnumOption(from).toLowerCase()} application to ${formatSingleEnumOption(to).toLowerCase()}.`;
