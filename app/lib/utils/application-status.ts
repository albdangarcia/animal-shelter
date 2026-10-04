import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "./enum-formatter";
import {
  EffectiveApplicationStatus,
  isReviewStatus,
} from "./derive-application-status";

// Every rule in this file is about an application's effective status: the
// answer `deriveApplicationStatus` gives, never the status column read on its
// own. ADOPTED and CLOSED are consequences of an Outcome recorded for the
// animal, and the column never holds them, so a rule that reads the column
// cannot see an application an outcome has closed.

// Shared by adoption and foster application status-change actions so both
// enforce the same pipeline instead of accepting any status change. A
// transition is a decision: staff move an application from one decision to the
// next, and never into or out of a consequence. See `allowedNextStatuses` for
// an application an outcome has adopted or closed.
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
  ApplicationStatus,
  readonly ApplicationStatus[]
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
  status: EffectiveApplicationStatus,
): readonly ApplicationStatus[] =>
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
export const BLOCKING_APPLICATION_STATUSES: EffectiveApplicationStatus[] = [
  EffectiveApplicationStatus.PENDING,
  EffectiveApplicationStatus.REVIEWING,
  EffectiveApplicationStatus.WAITLISTED,
  EffectiveApplicationStatus.APPROVED,
  EffectiveApplicationStatus.REJECTED,
  EffectiveApplicationStatus.WITHDRAWN,
  EffectiveApplicationStatus.ADOPTED,
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
export const STAFF_OVERRIDABLE_APPLICATION_STATUSES: EffectiveApplicationStatus[] = [
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

// The statuses that stop a second application for the same person and animal
// from existing alongside it: every blocking status except the ones staff may
// override. This is what "already has an application" means for anything that
// would create or revive one — the staff create action, and the applicant's own
// reactivation of a withdrawn application. Derived so a status added to
// BLOCKING_APPLICATION_STATUSES is active here until someone decides otherwise.
export const ACTIVE_APPLICATION_STATUSES: EffectiveApplicationStatus[] =
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
export const REACTIVATION_BLOCKING_STATUSES: EffectiveApplicationStatus[] =
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
export const APPLICANT_EDITABLE_STATUSES: EffectiveApplicationStatus[] = [
  ApplicationStatus.PENDING,
];

// Where an applicant may no longer withdraw their application: it is already
// withdrawn, staff have rejected it, or an outcome has adopted or closed it —
// nothing left to withdraw from, the animal has already left the shelter. The
// withdraw action refuses these, and the Withdraw button reads the same list so
// it is absent rather than present and guaranteed to fail.
export const NON_WITHDRAWABLE_STATUSES: EffectiveApplicationStatus[] = [
  EffectiveApplicationStatus.ADOPTED,
  EffectiveApplicationStatus.WITHDRAWN,
  EffectiveApplicationStatus.REJECTED,
  EffectiveApplicationStatus.CLOSED,
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
export const STAFF_EDITABLE_STATUSES: EffectiveApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
];

// The order a status sort puts applications in: the order a review moves
// through, then the consequences. A record rather than a list so that a status
// added to or removed from the enum is a type error here until someone places
// it.
export const STATUS_SORT_RANK: Record<EffectiveApplicationStatus, number> = {
  PENDING: 0,
  REVIEWING: 1,
  WAITLISTED: 2,
  APPROVED: 3,
  REJECTED: 4,
  WITHDRAWN: 5,
  ADOPTED: 6,
  CLOSED: 7,
};

// The applicant-visible reason the status history gives for an application an
// outcome closed. Keyed by all six OutcomeTypes because every one of them
// closes open applications — an animal that was transferred, reunited with its
// owner or that died closes them exactly the same way an adoption does, so
// this text can never be narrowed to adoption wording.
//
// DECEASED and EUTHANIZED deliberately share the non-specific line: a status
// history entry is the wrong channel for that news, and staff can phone the
// people who need to hear it properly.
export const CLOSURE_REASON_BY_OUTCOME: Record<OutcomeType, string> = {
  [OutcomeType.ADOPTION]: "This animal was adopted by another applicant.",
  [OutcomeType.TRANSFER_OUT]:
    "This animal was transferred to another organization.",
  [OutcomeType.RETURN_TO_OWNER]: "This animal was reunited with their owner.",
  [OutcomeType.DECEASED]: "This animal is no longer at the shelter.",
  [OutcomeType.EUTHANIZED]: "This animal is no longer at the shelter.",
  [OutcomeType.OTHER]: "This animal is no longer available for adoption.",
};

// One message per status, addressed to the applicant on their view of the
// application (`MyApplicationStatusMessage`). There is no notification system
// in this app, so that page plus the status history below it is the only place
// a status change is ever explained — every status needs its own sentence,
// including the ones staff never set.
//
// Two of these carry the weight of the whole feature:
//
// WAITLISTED has to read as "assessed and held", not as a slower PENDING —
// otherwise the applicant cannot tell the two apart and reads silence as
// neglect. CLOSED must never read as a rejection: it means the animal left the
// shelter while the application was open, it is not a judgment about the
// applicant, and it is the one status that leaves them free to apply again
// (see BLOCKING_APPLICATION_STATUSES).
//
// REJECTED is the deliberate contrast to CLOSED, and it does block re-applying
// for this animal, so it points at other animals rather than inviting an appeal.
export const MY_APPLICATION_STATUS_MESSAGES: Record<
  EffectiveApplicationStatus,
  { title: string; description: string }
> = {
  PENDING: {
    title: "Waiting for review",
    description:
      "Your application has been submitted and is waiting for a staff member to review it. You can still make changes to it while it is pending.",
  },
  REVIEWING: {
    title: "Under review",
    description:
      "A staff member is reviewing your application, so it can no longer be edited. If any of your details have changed, contact the shelter and they can update it for you.",
  },
  WAITLISTED: {
    title: "On the waitlist",
    description:
      "Your application has been reviewed and placed on the waitlist. Another applicant is being considered first — the shelter will be in touch if this animal becomes available to you.",
  },
  APPROVED: {
    title: "Approved",
    description:
      "Your application has been approved and this animal is being held for you. The shelter will contact you to arrange the adoption.",
  },
  REJECTED: {
    title: "Not moving forward",
    description:
      "The shelter has decided not to move forward with this application. Any reason they recorded is shown in the status history below. You are welcome to apply for other animals.",
  },
  WITHDRAWN: {
    title: "Withdrawn by you",
    description:
      "You withdrew this application. If this animal is still available for adoption you can reactivate it; otherwise you are welcome to apply for another animal.",
  },
  ADOPTED: {
    title: "Adoption complete",
    description:
      "This adoption has been finalised. Thank you for adopting — congratulations from all of us at the shelter.",
  },
  CLOSED: {
    title: "No longer available",
    description:
      "This animal is no longer available for adoption, so your application was closed. It is not a decision about you or your application — the reason is shown in the status history below, and if this animal is ever listed again you are welcome to apply.",
  },
};

// The reason the status history gives for an application an outcome closed.
// A foster-to-adopt conversion gets its own line: its adopter is the foster,
// and the conversion does not link their application, so one it closes may be
// the adopter's own, where "another applicant" would be false.
export const closureReason = ({
  type,
  byFoster,
}: {
  type: OutcomeType;
  byFoster: boolean;
}): string =>
  byFoster
    ? "This animal was adopted by the family fostering them."
    : CLOSURE_REASON_BY_OUTCOME[type];

// The reason the status history gives for the application an adoption was
// recorded against: through the ordinary outcome form, or by converting the
// foster-to-adopt placement the adopter was fostering the animal on.
export const adoptionReason = ({
  byFoster,
}: {
  byFoster: boolean;
}): string =>
  byFoster ? "Animal adopted by their foster." : "Animal adopted by applicant.";

// Joins a status list for a refusal message ("pending", "pending or
// waitlisted"). A message that spells its rule out by hand goes stale the
// moment someone edits the list it is reporting — which is how the old
// "PENDING is the only status the action accepts" comment came to be false —
// so every sentence that names these statuses derives them from the array.
export const formatStatusList = (
  statuses: EffectiveApplicationStatus[],
): string => {
  const labels = statuses.map((status) =>
    formatSingleEnumOption(status).toLowerCase(),
  );
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`
    : labels.join("");
};

export const isAllowedTransition = (
  from: EffectiveApplicationStatus,
  to: ApplicationStatus,
): boolean => allowedNextStatuses(from).includes(to);

// Whether staff must give a reason for moving an application from `from` to
// `to`. Any real change needs one, except picking a new application up for
// review: PENDING to REVIEWING says nothing the applicant needs explaining.
// The update action enforces this and the review form marks the reason field
// with it, so the two cannot disagree.
export const statusChangeNeedsReason = (
  from: EffectiveApplicationStatus,
  to: ApplicationStatus | undefined,
): boolean =>
  to !== undefined &&
  to !== from &&
  !(from === ApplicationStatus.PENDING && to === ApplicationStatus.REVIEWING);

export const illegalTransitionMessage = (
  from: EffectiveApplicationStatus,
  to: ApplicationStatus,
): string =>
  `Cannot change a${/^[aeiou]/i.test(from) ? "n" : ""} ${formatSingleEnumOption(from).toLowerCase()} application to ${formatSingleEnumOption(to).toLowerCase()}.`;
