// How medical protocols read in words. Pure, so the unit tests can pin it.

import {
  PROTOCOL_SKIP_REASON_TEXT,
  protocolStepLabel,
  stepItemSkipReason,
  type ProtocolPlanStep,
} from "./medical-protocol-plan";

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/** A species named in the plural, in lower case: "Dog" reads "dogs". */
export const speciesPlural = (name: string): string => {
  const lower = name.trim().toLowerCase();
  return lower.endsWith("s") ? lower : `${lower}s`;
};

/**
 * The ages a protocol covers, as whole days on the intake day: "from birth to
 * 139 days", "from 140 days", "from 56 to 139 days", "at every age". The
 * range includes `minAgeDays` and stops short of `maxAgeDays`, so the last
 * age read is the day before it.
 */
export const coveredAgesText = (
  minAgeDays: number | null,
  maxAgeDays: number | null,
): string => {
  const from = minAgeDays ?? 0;
  if (maxAgeDays === null) {
    return from === 0 ? "at every age" : `from ${days(from)}`;
  }
  const to = maxAgeDays - 1;
  if (to === from) return `aged ${days(from)}`;
  return from === 0 ? `from birth to ${days(to)}` : `from ${from} to ${days(to)}`;
};

/** An age in whole weeks when it is one, in days otherwise: "6 weeks", "45 days". */
export const ageText = (ageDays: number): string => {
  if (ageDays > 0 && ageDays % 7 === 0) {
    const weeks = ageDays / 7;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  return days(ageDays);
};

/**
 * Who a protocol is for, as the settings page lists it: "Dogs under 140
 * days", "Dogs from 140 days", "Dogs from 56 days, under 140 days", "Dogs of
 * every age". The range includes `minAgeDays` and stops short of
 * `maxAgeDays`, which is why it reads "under".
 */
export const protocolAgesText = (
  speciesName: string,
  minAgeDays: number | null,
  maxAgeDays: number | null,
): string => {
  const species = speciesPlural(speciesName);
  const who = species.charAt(0).toUpperCase() + species.slice(1);
  const from = minAgeDays ?? 0;
  if (maxAgeDays === null) {
    return from === 0 ? `${who} of every age` : `${who} from ${days(from)}`;
  }
  return from === 0
    ? `${who} under ${days(maxAgeDays)}`
    : `${who} from ${days(from)}, under ${days(maxAgeDays)}`;
};

/** When a step is due and how often, as one step's line reads it. */
export interface ProtocolStepTiming {
  offsetDays: number;
  notBeforeAgeDays: number | null;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  untilAgeDays: number | null;
}

/**
 * When a step's care is due, in words: "from intake, not before 6 weeks,
 * every 14 days until 20 weeks"; "7 days after intake, not before 8 weeks";
 * "at intake, only under 20 weeks". Ages read in weeks when they are whole
 * weeks.
 */
export const protocolStepTimingText = (step: ProtocolStepTiming): string => {
  const repeats = step.repeatIntervalDays !== null;
  const parts: string[] = [];
  if (step.offsetDays === 0) {
    parts.push(repeats ? "from intake" : "at intake");
  } else {
    const after = `${days(step.offsetDays)} after intake`;
    parts.push(repeats ? `from ${after}` : after);
  }
  if (step.notBeforeAgeDays !== null) {
    parts.push(`not before ${ageText(step.notBeforeAgeDays)}`);
  }
  if (step.repeatIntervalDays !== null) {
    const every = `every ${days(step.repeatIntervalDays)}`;
    const count = step.repeatCount;
    const more =
      count === null ? null : `${count} more ${count === 1 ? "time" : "times"}`;
    if (step.untilAgeDays !== null) {
      const until = `${every} until ${ageText(step.untilAgeDays)}`;
      parts.push(more ? `${until}, at most ${more}` : until);
    } else {
      parts.push(more ? `${every}, ${more}` : every);
    }
  } else if (step.untilAgeDays !== null) {
    parts.push(`only under ${ageText(step.untilAgeDays)}`);
  }
  return parts.join(", ");
};

/** A step's name as a line starts with it: "DHPP", "Spay/neuter", "Intake exam". */
export const protocolStepName = (
  step: Pick<ProtocolPlanStep, "kind" | "item" | "examType">,
): string => {
  const label = protocolStepLabel(step);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Why a saved step won't schedule anything for any animal now: its item was
 * retired, or narrowed to other species, since the protocol was saved. Null
 * when it still can.
 */
export const protocolStepIssueText = (
  step: Pick<ProtocolPlanStep, "item">,
  speciesId: string,
): string | null => {
  const reason = step.item ? stepItemSkipReason(step.item, speciesId) : null;
  return reason ? `won't be scheduled: ${PROTOCOL_SKIP_REASON_TEXT[reason]}` : null;
};
