import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "./enum-formatter";
import { isReviewStatus, type ReviewStatus } from "./derive-application-status";

// Every rule in this file is about an application's effective status: the
// answer `deriveApplicationStatus` gives, never the status column read on its
// own. ADOPTED and CLOSED are consequences of an Outcome recorded for the
// animal, and the derivation is what says whether one holds. The column still
// carries them for now, but a rule that reads the column is reading a copy.

// Shared by adoption and foster application status-change actions so both
// enforce the same pipeline instead of accepting any status change. Keyed by
// the review decisions only, because a transition is a decision: staff move an
// application from one decision to the next, and never into or out of a
// consequence. See `allowedNextStatuses` for an application an outcome holds.
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
export const ALLOWED_APPLICATION_TRANSITIONS: Record<
  ReviewStatus,
  readonly ReviewStatus[]
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
};

// Where staff may move an application to, given its effective status. An
// application an outcome has adopted or closed has nothing left for review to
// decide: the animal has left, and no review decision brings it back.
export const allowedNextStatuses = (
  status: ApplicationStatus,
): readonly ReviewStatus[] =>
  isReviewStatus(status) ? ALLOWED_APPLICATION_TRANSITIONS[status] : [];

// The statuses that stop this person applying for this animal again.
//
// CLOSED is the one status that does not: it means the animal left the
// shelter while the application was open, which is not a judgment on the
// applicant, so if the animal comes back and is republished they are free to
// apply again. REJECTED still blocks — a staff rejection is a decision, and
// re-applying is not the way to appeal it. Flip that by removing REJECTED
// from this list; every apply gate reads it.
//
// Whether an application blocks is therefore a question about its derived
// status, and so is every list below that is built from this one: test
// membership against what `deriveApplicationStatus` returns. The column is not
// what says an application is closed.
export const BLOCKING_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ADOPTED,
];

// The blocking statuses staff may enter a new application over anyway. The
// applicant-side rule exists so that re-applying is not a way to appeal a
// decision; a staff member taking a fresh walk-in application after a
// rejection, or after the person withdrew and came back in, is making that
// decision themselves. For WITHDRAWN it is also the only route back: staff
// cannot reactivate an application, and a person with no account cannot do it
// for themselves. What the override could otherwise leave behind — a withdrawn
// application and its replacement both live once the person signs up — is
// closed on the applicant's side, where reactivation refuses while another
// application for the animal is active.
//
// CLOSED is not listed because it is not in BLOCKING_APPLICATION_STATUSES.
export const STAFF_OVERRIDABLE_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

// The statuses that stop a second application for the same person and animal
// from existing alongside it: every blocking status except the ones staff may
// override. This is what "already has an application" means for anything that
// would create or revive one — the staff create action, and the applicant's own
// reactivation of a withdrawn application. Derived so a status added to
// BLOCKING_APPLICATION_STATUSES is active here until someone decides otherwise.
export const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] =
  BLOCKING_APPLICATION_STATUSES.filter(
    (status) => !STAFF_OVERRIDABLE_APPLICATION_STATUSES.includes(status),
  );

// What another application for the same animal has to be before an applicant
// may revive a withdrawn one. Not the active list: staff may file over a
// REJECTED application, but the applicant reviving their own older one is not
// staff making that call, and reactivation would otherwise be the appeal route
// that BLOCKING_APPLICATION_STATUSES exists to close — the same person cannot
// submit a new application for an animal they were rejected for.
//
// Not the blocking list either: WITHDRAWN has to stay out of it. Reactivation
// is the only way back from WITHDRAWN, so counting a withdrawn sibling as a
// blocker would strand someone whose two applications for one animal were both
// withdrawn — and a withdrawn application is inert, so reviving one beside it
// creates nothing this guard exists to prevent.
export const REACTIVATION_BLOCKING_STATUSES: ApplicationStatus[] =
  BLOCKING_APPLICATION_STATUSES.filter(
    (status) => status !== ApplicationStatus.WITHDRAWN,
  );

// Where an applicant may still change the application they submitted. Only
// PENDING: once staff have picked it up (REVIEWING) or held it (WAITLISTED)
// they are deciding on the text as it stands, and WAITLISTED never returns to
// PENDING, so leaving it editable would leave it editable forever with no
// signal to the reviewer. An allow-list rather than a deny-list so a status
// added to the enum is non-editable until someone decides otherwise. The edit
// page, the Edit link and the update action all read this.
export const APPLICANT_EDITABLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
];

// Where staff may still rewrite the applicant snapshot of a walk-in
// application (one whose person has no account). Broader than the applicant's
// list because staff are the reviewers — they transcribed the snapshot at
// intake and correcting it mid-review, or after approval when a phone number
// turns out to be wrong, is ordinary. The closed-out statuses are excluded:
// REJECTED and WITHDRAWN are settled decisions, and an application an outcome
// has adopted or closed is a record of what happened, so rewriting the
// snapshot behind any of them would leave the outcome resting on text that no
// longer says what it said.
export const STAFF_EDITABLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
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

// Joins a status list for a refusal message ("pending", "pending or
// waitlisted"). A message that spells its rule out by hand goes stale the
// moment someone edits the list it is reporting — which is how the old
// "PENDING is the only status the action accepts" comment came to be false —
// so every sentence that names these statuses derives them from the array.
export const formatStatusList = (statuses: ApplicationStatus[]): string => {
  const labels = statuses.map((status) =>
    formatSingleEnumOption(status).toLowerCase(),
  );
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`
    : labels.join("");
};

export const isAllowedTransition = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean => (allowedNextStatuses(from) as readonly ApplicationStatus[]).includes(to);

export const illegalTransitionMessage = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): string =>
  `Cannot change a${/^[aeiou]/i.test(from) ? "n" : ""} ${formatSingleEnumOption(from).toLowerCase()} application to ${formatSingleEnumOption(to).toLowerCase()}.`;
