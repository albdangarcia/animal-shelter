import { OutcomeType } from "@/prisma/generated/enums";

/**
 * How each outcome type is named on screen and in exports, and which count as
 * live. No database or `next/*` imports, so the form, the reports and a plain
 * unit test all read the same definitions.
 */

// Title case like the rest of the outcome form's options. OTHER is named for
// what it now means: a live outcome that fits no other type. An escape or an
// unknown fate is LOST_IN_CARE, not OTHER.
export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  [OutcomeType.ADOPTION]: "Adoption",
  [OutcomeType.TRANSFER_OUT]: "Transfer Out",
  [OutcomeType.RETURN_TO_OWNER]: "Return To Owner",
  [OutcomeType.RETURN_TO_FIELD]: "Return To Field",
  [OutcomeType.OTHER]: "Other Live Outcome",
  [OutcomeType.DECEASED]: "Deceased",
  [OutcomeType.EUTHANIZED]: "Euthanized",
  [OutcomeType.LOST_IN_CARE]: "Lost In Care",
};

/** Display name of an outcome type, as the outcome form offers it. */
export const formatOutcomeType = (type: OutcomeType): string =>
  OUTCOME_TYPE_LABELS[type];

/**
 * An outcome type inside a sentence, as the activity history writes it:
 * "processed for outcome: other live outcome."
 */
export const describeOutcomeType = (type: OutcomeType): string =>
  formatOutcomeType(type).toLowerCase();

/**
 * Live outcomes per Shelter Animals Count: the animal left the shelter alive.
 * Return to field is live (a stray released where it was found), and so is
 * OTHER, which means "other live outcome". Euthanized, deceased and lost in
 * care are non-live. This one list is the source of truth for the overview
 * card, the outcomes report and its export, so their numbers can't drift.
 */
export const LIVE_OUTCOME_TYPES: readonly OutcomeType[] = [
  OutcomeType.ADOPTION,
  OutcomeType.RETURN_TO_OWNER,
  OutcomeType.TRANSFER_OUT,
  OutcomeType.RETURN_TO_FIELD,
  OutcomeType.OTHER,
];

/** True when an outcome type counts toward the live release rate. */
export function isLiveOutcome(type: OutcomeType): boolean {
  return LIVE_OUTCOME_TYPES.includes(type);
}

// Report order: the live types in Shelter Animals Count's order, then the
// non-live ones. Every type appears exactly once.
export const OUTCOME_TYPE_REPORT_ORDER: readonly OutcomeType[] = [
  ...LIVE_OUTCOME_TYPES,
  OutcomeType.EUTHANIZED,
  OutcomeType.DECEASED,
  OutcomeType.LOST_IN_CARE,
];

/**
 * A line under the outcome type picker saying what the chosen type covers,
 * for the types whose name alone is easy to misread. Null for the others.
 */
export const OUTCOME_TYPE_HELP: Partial<Record<OutcomeType, string>> = {
  [OutcomeType.OTHER]:
    "A live outcome that fits none of the other types. An animal that escaped or whose fate is unknown is Lost In Care instead.",
  [OutcomeType.RETURN_TO_FIELD]:
    "A stray, already altered or altered here, released where it was found (often called SNR). Not trap-neuter-return.",
  [OutcomeType.LOST_IN_CARE]:
    "The animal escaped, or its outcome is unknown. Counts as a non-live outcome.",
};
