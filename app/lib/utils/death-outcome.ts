import { OutcomeType } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";

/**
 * The outcomes that end an animal's life. No re-intake may follow one; a death
 * recorded by mistake is reversed instead. Pure, so the service, the data
 * layer and the pages can all share the wording.
 */
const DEATH_OUTCOMES = [OutcomeType.DECEASED, OutcomeType.EUTHANIZED] as const;

export type DeathOutcome = (typeof DEATH_OUTCOMES)[number];

export const isDeathOutcome = (type: OutcomeType): type is DeathOutcome =>
  (DEATH_OUTCOMES as readonly OutcomeType[]).includes(type);

/** "Deceased" or "Euthanized", as the outcome form names them. */
export const deathOutcomeLabel = (type: DeathOutcome) =>
  formatSingleEnumOption(type);

/** What staff can do about a death recorded by mistake, said everywhere alike. */
export const DEATH_REVERSAL_HINT =
  "If the outcome was recorded by mistake, an admin can reverse it from the Outcomes list, which puts the animal back in care.";

export const deathRefusalMessage = (type: DeathOutcome) =>
  `Cannot process re-intake: This animal's outcome was ${deathOutcomeLabel(
    type,
  )}, and an animal that has died can't be taken back in. ${DEATH_REVERSAL_HINT}`;
