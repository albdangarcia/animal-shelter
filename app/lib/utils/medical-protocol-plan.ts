// What a medical protocol schedules for an animal arriving on a given day:
// which protocol fits it, the due day of every dose each step plans, and the
// steps it leaves out, with why. The intake forms' preview and the server
// applying a protocol both call this, so what staff see before saving is
// what is written, and the server's plan at commit is the one that counts.
//
// Pure: plain data in, no Prisma client and no clock, so the unit tests can
// pin every branch.

import type { CareKind } from "@/app/lib/services/medical-entry";
import {
  EXAM_TYPE_LABELS,
  MAX_PROTOCOL_STEP_DOSES,
} from "@/app/lib/constants/medical";
import { latestDueDate } from "@/app/lib/utils/medical-days";
import {
  spayNeuterStatus,
  type SpayNeuterEntry,
} from "@/app/lib/utils/spay-neuter";
import {
  shelterDaysBetweenKeys,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  MedicalEntryKind,
  MedicalProtocolStepKind,
  Sex,
  SurgeryProcedure,
  type ExamType,
} from "@/prisma/generated/enums";

export interface ProtocolPlanStep {
  id: string;
  kind: MedicalProtocolStepKind;
  /**
   * The catalog item of a vaccine, test or treatment step, as it is now:
   * retired, or narrowed to other species, since the protocol was saved, the
   * step is left out. Empty `speciesIds` means every species.
   */
  item: {
    id: string;
    name: string;
    retired: boolean;
    speciesIds: string[];
  } | null;
  examType: ExamType | null;
  offsetDays: number;
  notBeforeAgeDays: number | null;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  untilAgeDays: number | null;
  notes: string | null;
  sortOrder: number;
}

export interface ProtocolPlanProtocol {
  id: string;
  name: string;
  speciesId: string;
  minAgeDays: number | null;
  maxAgeDays: number | null;
  retired: boolean;
  /** Its live steps. */
  steps: ProtocolPlanStep[];
}

/** The days a protocol is planned from: the animal's birth and its intake. */
export interface ProtocolPlanDays {
  birthDate: CalendarDay;
  intakeDate: CalendarDay;
}

/** What a plan needs to know about the animal on its intake day. */
export interface ProtocolPlanFacts extends ProtocolPlanDays {
  speciesId: string;
  sex: Sex;
  /** Spayed or neutered on its record. */
  altered: boolean;
  /**
   * Exempt from spay/neuter on its record: an exemption that still holds on
   * the intake day. A protocol doesn't override an exemption staff recorded.
   */
  exempt: boolean;
  /** Has a current microchip on its record. */
  chipped: boolean;
  /** Care already open and scheduled for it, such as a returning animal's. */
  openScheduled: {
    itemIds: string[];
    examTypes: ExamType[];
    spayNeuter: boolean;
    microchip: boolean;
  };
}

/**
 * What an animal's medical record says that a plan reads, before its intake
 * day is known: the server reads it behind the animal's lock, and the
 * re-intake form's preview reads it with the page.
 */
export interface ProtocolRecordFacts {
  /** Its spay and neuter entries that aren't voided. */
  spayNeuterEntries: SpayNeuterEntry[];
  chipped: boolean;
  openScheduled: ProtocolPlanFacts["openScheduled"];
}

/** A record with nothing on it: an animal being created. */
export const EMPTY_RECORD_FACTS: ProtocolRecordFacts = {
  spayNeuterEntries: [],
  chipped: false,
  openScheduled: { itemIds: [], examTypes: [], spayNeuter: false, microchip: false },
};

/**
 * Whether the record has the animal spayed or neutered, and exempt from it on
 * the intake day, by the spay/neuter status's own rule.
 */
export const spayNeuterFactsOn = (
  entries: SpayNeuterEntry[],
  intakeDate: CalendarDay,
): Pick<ProtocolPlanFacts, "altered" | "exempt"> => {
  const { status } = spayNeuterStatus(entries, intakeDate);
  return { altered: status === "ALTERED", exempt: status === "EXEMPT" };
};

/** Why a step schedules nothing, in the order they are checked. */
export const PROTOCOL_SKIP_REASONS = [
  "ITEM_RETIRED",
  "ITEM_NOT_FOR_SPECIES",
  "SEX_UNKNOWN",
  "ALREADY_ALTERED",
  "EXEMPT",
  "ALREADY_CHIPPED",
  "ALREADY_SCHEDULED",
  "TOO_OLD",
  "BEYOND_CEILING",
] as const;

export type ProtocolSkipReason = (typeof PROTOCOL_SKIP_REASONS)[number];

/** A skip reason as it reads after the step's name: "spay/neuter (sex unknown)". */
export const PROTOCOL_SKIP_REASON_TEXT: Record<ProtocolSkipReason, string> = {
  ITEM_RETIRED: "retired from the catalog",
  ITEM_NOT_FOR_SPECIES: "not for this species",
  SEX_UNKNOWN: "sex unknown",
  ALREADY_ALTERED: "already spayed or neutered",
  EXEMPT: "exempt from spay/neuter",
  ALREADY_CHIPPED: "already microchipped",
  ALREADY_SCHEDULED: "already scheduled",
  TOO_OLD: "past the age for it",
  BEYOND_CEILING: "more than five years ahead",
};

export interface PlannedProtocolEntry {
  stepId: string;
  care: CareKind;
  dueDate: CalendarDay;
  notes: string | null;
}

export interface SkippedProtocolStep {
  stepId: string;
  label: string;
  reason: ProtocolSkipReason;
}

export interface ProtocolPlan {
  protocol: { id: string; name: string };
  /** By due day, then by step order. */
  entries: PlannedProtocolEntry[];
  /** In step order. */
  skipped: SkippedProtocolStep[];
}

/**
 * An animal's age in whole days on `day`. Never negative: a birth day after
 * `day` counts as age 0.
 */
export const ageInDays = (birthDate: CalendarDay, day: CalendarDay): number =>
  shelterDaysBetweenKeys(birthDate, day);

/**
 * The live protocol of the animal's species whose age range holds its age on
 * the intake day, or null. A range includes `minAgeDays` and stops short of
 * `maxAgeDays`; a missing end is open. Live protocols of one species never
 * overlap, so at most one fits.
 */
export const matchProtocol = <P extends ProtocolPlanProtocol>(
  protocols: readonly P[],
  facts: { speciesId: string } & ProtocolPlanDays,
): P | null => {
  const age = ageInDays(facts.birthDate, facts.intakeDate);
  return (
    protocols.find(
      (protocol) =>
        !protocol.retired &&
        protocol.speciesId === facts.speciesId &&
        (protocol.minAgeDays === null || age >= protocol.minAgeDays) &&
        (protocol.maxAgeDays === null || age < protocol.maxAgeDays),
    ) ?? null
  );
};

type StepDays =
  | { days: CalendarDay[] }
  | { days: []; reason: "TOO_OLD" | "BEYOND_CEILING" };

/**
 * The due days of a step's doses. The first is due on the latest of the
 * intake day plus `offsetDays`, the day the animal reaches `notBeforeAgeDays`,
 * and today: a backdated intake starts its care today, never in the past.
 * Further doses follow every `repeatIntervalDays`, `repeatCount` more of them
 * at most, and at most `MAX_PROTOCOL_STEP_DOSES` in all. A dose is kept only
 * while the animal is under `untilAgeDays` on its day and the day is within
 * the scheduling ceiling; the first dose that isn't ends the step. With no
 * dose kept, the reason is the first dose's.
 */
export const planStepDays = (
  step: Pick<
    ProtocolPlanStep,
    | "offsetDays"
    | "notBeforeAgeDays"
    | "repeatIntervalDays"
    | "repeatCount"
    | "untilAgeDays"
  >,
  days: ProtocolPlanDays,
  today: CalendarDay,
): StepDays => {
  const candidates = [shiftDayKey(days.intakeDate, step.offsetDays), today];
  if (step.notBeforeAgeDays !== null) {
    candidates.push(shiftDayKey(days.birthDate, step.notBeforeAgeDays));
  }
  const first = candidates.reduce((latest, day) => (day > latest ? day : latest));

  const interval = step.repeatIntervalDays;
  const doses =
    interval === null
      ? 1
      : Math.min(
          MAX_PROTOCOL_STEP_DOSES,
          step.repeatCount === null ? MAX_PROTOCOL_STEP_DOSES : 1 + step.repeatCount,
        );
  const ceiling = latestDueDate(today);

  const kept: CalendarDay[] = [];
  for (let dose = 0; dose < doses; dose++) {
    const day = dose === 0 ? first : shiftDayKey(first, dose * interval!);
    const tooOld =
      step.untilAgeDays !== null && ageInDays(days.birthDate, day) >= step.untilAgeDays;
    if (tooOld || day > ceiling) {
      if (kept.length === 0) {
        return { days: [], reason: tooOld ? "TOO_OLD" : "BEYOND_CEILING" };
      }
      break;
    }
    kept.push(day);
  }
  return { days: kept };
};

/** What a step is called in a plan: its item, "spay/neuter", "microchip" or its exam. */
export const protocolStepLabel = (
  step: Pick<ProtocolPlanStep, "kind" | "item" | "examType">,
): string => {
  switch (step.kind) {
    case MedicalProtocolStepKind.SPAY_NEUTER:
      return "spay/neuter";
    case MedicalProtocolStepKind.MICROCHIP:
      return "microchip";
    case MedicalProtocolStepKind.EXAM:
      return step.examType ? EXAM_TYPE_LABELS[step.examType] : "exam";
    default:
      return step.item?.name ?? "catalog item";
  }
};

/**
 * Why a catalog step's item can't be scheduled for a species any more:
 * retired, or narrowed to other species, since the protocol was saved. Null
 * when it still fits. The editor flags such a step with the same reason.
 */
export const stepItemSkipReason = (
  item: NonNullable<ProtocolPlanStep["item"]>,
  speciesId: string,
): "ITEM_RETIRED" | "ITEM_NOT_FOR_SPECIES" | null => {
  if (item.retired) return "ITEM_RETIRED";
  if (item.speciesIds.length > 0 && !item.speciesIds.includes(speciesId)) {
    return "ITEM_NOT_FOR_SPECIES";
  }
  return null;
};

/**
 * What a step schedules for this animal, or why it schedules nothing that
 * doesn't depend on the days.
 */
const stepCare = (
  step: ProtocolPlanStep,
  facts: ProtocolPlanFacts,
): { care: CareKind } | { reason: ProtocolSkipReason } => {
  switch (step.kind) {
    case MedicalProtocolStepKind.SPAY_NEUTER: {
      if (facts.sex === Sex.UNKNOWN) return { reason: "SEX_UNKNOWN" };
      if (facts.altered) return { reason: "ALREADY_ALTERED" };
      if (facts.exempt) return { reason: "EXEMPT" };
      if (facts.openScheduled.spayNeuter) return { reason: "ALREADY_SCHEDULED" };
      const procedure =
        facts.sex === Sex.FEMALE ? SurgeryProcedure.SPAY : SurgeryProcedure.NEUTER;
      return { care: { kind: MedicalEntryKind.SURGERY, procedure } };
    }
    case MedicalProtocolStepKind.MICROCHIP:
      if (facts.chipped) return { reason: "ALREADY_CHIPPED" };
      if (facts.openScheduled.microchip) return { reason: "ALREADY_SCHEDULED" };
      return { care: { kind: MedicalEntryKind.MICROCHIP } };
    case MedicalProtocolStepKind.EXAM: {
      const examType = step.examType;
      if (!examType) {
        throw new Error(`Protocol step ${step.id} is an exam with no type.`);
      }
      if (facts.openScheduled.examTypes.includes(examType)) {
        return { reason: "ALREADY_SCHEDULED" };
      }
      return { care: { kind: MedicalEntryKind.EXAM, examType } };
    }
    default: {
      const item = step.item;
      if (!item) {
        throw new Error(`Protocol step ${step.id} has no catalog item.`);
      }
      const itemReason = stepItemSkipReason(item, facts.speciesId);
      if (itemReason) return { reason: itemReason };
      if (facts.openScheduled.itemIds.includes(item.id)) {
        return { reason: "ALREADY_SCHEDULED" };
      }
      // Step and entry kinds share these three values.
      return { care: { kind: step.kind, itemId: item.id } };
    }
  }
};

/**
 * Every entry `protocol` schedules for an animal with these facts when today
 * is `today`, and every step it leaves out, named with its reason.
 */
export const planProtocol = (
  protocol: Pick<ProtocolPlanProtocol, "id" | "name" | "steps">,
  facts: ProtocolPlanFacts,
  today: CalendarDay,
): ProtocolPlan => {
  const steps = [...protocol.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const planned: (PlannedProtocolEntry & { order: number })[] = [];
  const skipped: SkippedProtocolStep[] = [];

  steps.forEach((step, order) => {
    const skip = (reason: ProtocolSkipReason) =>
      skipped.push({ stepId: step.id, label: protocolStepLabel(step), reason });

    const care = stepCare(step, facts);
    if ("reason" in care) {
      skip(care.reason);
      return;
    }
    const days = planStepDays(step, facts, today);
    if ("reason" in days) {
      skip(days.reason);
      return;
    }
    for (const dueDate of days.days) {
      planned.push({ stepId: step.id, care: care.care, dueDate, notes: step.notes, order });
    }
  });

  planned.sort((a, b) =>
    a.dueDate === b.dueDate ? a.order - b.order : a.dueDate < b.dueDate ? -1 : 1,
  );
  return {
    protocol: { id: protocol.id, name: protocol.name },
    entries: planned.map(({ order: _order, ...entry }) => entry),
    skipped,
  };
};
