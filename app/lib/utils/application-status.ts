import { ApplicationStatus } from "@prisma/client";
import { formatSingleEnumOption } from "./enum-formatter";

// Shared by adoption and foster application status-change actions so both
// enforce the same pipeline instead of accepting any status change.
//
// WAITLISTED is grouped with PENDING/REVIEWING as a non-terminal "in
// progress" state — other in-progress states can move into it, and from
// it the application can only move forward to APPROVED or off to
// REJECTED/WITHDRAWN (never back to PENDING/REVIEWING).
//
// REJECTED/WITHDRAWN are terminal: the applicant re-applies rather than
// staff reviving an opted-out application. APPROVED is reversible only to
// the two terminal states — that's the "approved applicant backs out"
// path (adoption additionally releases the animal back to PUBLISHED).
//
// ADOPTED is never set through these actions (it's set by the outcome
// flow), so it has no outgoing transitions here.
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
};

export const isAllowedTransition = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean => ALLOWED_APPLICATION_TRANSITIONS[from].includes(to);

export const illegalTransitionMessage = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): string =>
  `Cannot change a${/^[aeiou]/i.test(from) ? "n" : ""} ${formatSingleEnumOption(from).toLowerCase()} application to ${formatSingleEnumOption(to).toLowerCase()}.`;
