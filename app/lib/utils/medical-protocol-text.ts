// How medical protocols read in words. Pure, so the unit tests can pin it.

import {
  PROTOCOL_SKIP_REASON_TEXT,
  protocolStepLabel,
  stepItemSkipReason,
  type ProtocolPlan,
  type ProtocolPlanStep,
  type SkippedProtocolStep,
} from "./medical-protocol-plan";
import { SURGERY_PROCEDURE_LABELS } from "@/app/lib/constants/medical";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import { format, parseISO } from "date-fns";
import type { CalendarDay } from "./shelter-day";

/**
 * A protocol as sentences name it: "Puppy protocol". A name that already
 * ends in "protocol" reads as it is.
 */
export const protocolTitle = (name: string): string =>
  /\bprotocol$/i.test(name.trim()) ? name.trim() : `${name.trim()} protocol`;

/**
 * Where care a protocol scheduled came from, as its row reads: "From the
 * Puppy protocol". The protocol's name as it is now, renamed or not.
 */
export const protocolSourceText = (name: string): string =>
  `From the ${protocolTitle(name)}`;

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

// "a", "a and b", "a, b and c".
const listText = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The steps a plan leaves out, as a sentence: "Not scheduled: spay/neuter
 * (sex unknown) and microchip (already microchipped)." Empty when none is.
 */
export const notScheduledText = (skipped: SkippedProtocolStep[]): string =>
  skipped.length === 0
    ? ""
    : `Not scheduled: ${listText(
        skipped.map((step) => `${step.label} (${PROTOCOL_SKIP_REASON_TEXT[step.reason]})`),
      )}.`;

/** How many entries a plan schedules: "9 entries", "1 entry", "nothing to schedule". */
export const plannedEntriesText = (count: number): string =>
  count === 0 ? "nothing to schedule" : `${count} ${count === 1 ? "entry" : "entries"}`;

/** A due day in a preview line: "Oct 19" this year, "Feb 3, 2027" in another. */
const previewDayText = (day: CalendarDay, today: CalendarDay) =>
  format(parseISO(day), day.slice(0, 4) === today.slice(0, 4) ? "MMM d" : "MMM d, yyyy");

export interface ProtocolPreviewLine {
  stepId: string;
  /** "DHPP", "Spay", "Intake exam". */
  name: string;
  /** "Oct 19, Nov 2, Nov 16". */
  days: string;
}

/**
 * What a plan schedules, one line per step that schedules anything, in the
 * protocol's step order: "DHPP: Oct 19, Nov 2, Nov 16". A spay/neuter step
 * reads as what it resolved to for this animal.
 */
export const protocolPreviewLines = (
  plan: ProtocolPlan,
  steps: Pick<ProtocolPlanStep, "id" | "kind" | "item" | "examType" | "sortOrder">[],
  today: CalendarDay,
): ProtocolPreviewLine[] =>
  [...steps]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((step) => {
      const entries = plan.entries.filter((entry) => entry.stepId === step.id);
      if (entries.length === 0) return [];
      const care = entries[0].care;
      const name =
        care.kind === MedicalEntryKind.SURGERY
          ? SURGERY_PROCEDURE_LABELS[care.procedure]
          : protocolStepName(step);
      return [
        {
          stepId: step.id,
          name,
          days: entries.map((entry) => previewDayText(entry.dueDate, today)).join(", "),
        },
      ];
    });
