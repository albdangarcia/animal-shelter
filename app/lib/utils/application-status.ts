import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";
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

// The applicant-visible reason written onto every application the outcome
// cascade closes. Keyed by all six OutcomeTypes because the cascade runs for
// every one of them — an animal that was transferred, reunited with its owner
// or that died closes open applications exactly the same way an adoption does,
// so this text can never be narrowed to adoption wording.
//
// DECEASED and EUTHANIZED deliberately share the non-specific line: a bulk
// auto-generated history row is the wrong channel for that news, and staff can
// phone the people who need to hear it properly.
//
// This lives here rather than next to the cascade in `outcome.actions.ts`
// because that file is `"use server"`, where every export must be an async
// function — a const export there is a build error. `prisma/seed.ts` mirrors
// the cascade and reads the same map, so seeded closures and real ones cannot
// drift apart.
export const CLOSURE_REASON_BY_OUTCOME: Record<OutcomeType, string> = {
  [OutcomeType.ADOPTION]: "This animal was adopted by another applicant.",
  [OutcomeType.TRANSFER_OUT]:
    "This animal was transferred to another organization.",
  [OutcomeType.RETURN_TO_OWNER]: "This animal was reunited with their owner.",
  [OutcomeType.DECEASED]: "This animal is no longer at the shelter.",
  [OutcomeType.EUTHANIZED]: "This animal is no longer at the shelter.",
  [OutcomeType.OTHER]: "This animal is no longer available for adoption.",
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
