import { AssessmentSignal } from "@/prisma/generated/enums";

/**
 * The triage signal ordered least → most urgent, so code can compare two
 * signals and take the higher one. Mirrors the enum declaration order.
 */
export const SIGNAL_ORDER: readonly AssessmentSignal[] = [
  AssessmentSignal.NO_CONCERNS,
  AssessmentSignal.MONITOR,
  AssessmentSignal.FOLLOW_UP,
  AssessmentSignal.ESCALATE,
];

const rank = (signal: AssessmentSignal): number =>
  SIGNAL_ORDER.indexOf(signal);

/** The more urgent of two signals. */
export const maxSignal = (
  a: AssessmentSignal,
  b: AssessmentSignal,
): AssessmentSignal => (rank(a) >= rank(b) ? a : b);

/**
 * The signal an assessment should carry once its concerning answers are taken
 * into account. A recorded observation that hit at least one concerning value
 * can never sit at `NO_CONCERNS` — it is floored at `MONITOR`. A reviewer who
 * has already judged it more urgent keeps their choice.
 */
export const deriveSignal = (
  chosen: AssessmentSignal,
  concerningAnswerCount: number,
): AssessmentSignal =>
  concerningAnswerCount > 0
    ? maxSignal(chosen, AssessmentSignal.MONITOR)
    : chosen;

const SIGNAL_LABELS: Record<AssessmentSignal, string> = {
  [AssessmentSignal.NO_CONCERNS]: "No concerns",
  [AssessmentSignal.MONITOR]: "Monitor",
  [AssessmentSignal.FOLLOW_UP]: "Follow up",
  [AssessmentSignal.ESCALATE]: "Escalate",
};

export const formatSignal = (signal: AssessmentSignal): string =>
  SIGNAL_LABELS[signal];
