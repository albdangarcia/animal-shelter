import { ExamFindingStatus } from "@/prisma/generated/enums";
import {
  EXAM_BODY_SYSTEMS,
  examBodySystemLabel,
} from "@/app/lib/constants/exam";

/** One body system's finding, as a form or the service is given it. */
export interface ExamFindingInput {
  bodySystem: string;
  status: ExamFindingStatus;
  notes?: string | null;
}

const joinLabels = (labels: string[]) =>
  labels.length <= 1
    ? labels.join("")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/**
 * What is wrong with an exam's findings, or null when nothing is. An exam
 * has exactly one finding for each body system it is held to
 * (`systemKeys`), none for any other system, and a note on every Abnormal
 * one, saying what was found. Returns the first problem found, in that
 * order.
 */
export const examFindingsIssue = (
  findings: readonly ExamFindingInput[],
  systemKeys: readonly string[],
): string | null => {
  const seen = new Set<string>();
  for (const finding of findings) {
    if (!systemKeys.includes(finding.bodySystem)) {
      return "A finding was given for a body system this exam doesn't look at.";
    }
    if (seen.has(finding.bodySystem)) {
      return `${examBodySystemLabel(finding.bodySystem)} has more than one finding.`;
    }
    seen.add(finding.bodySystem);
  }
  const missing = systemKeys.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    return `A finding is needed for ${joinLabels(missing.map(examBodySystemLabel))}.`;
  }
  const unexplained = findings.find(
    (finding) =>
      finding.status === ExamFindingStatus.ABNORMAL && !finding.notes?.trim(),
  );
  if (unexplained) {
    return `${examBodySystemLabel(unexplained.bodySystem)} is abnormal: say what was found.`;
  }
  return null;
};

/**
 * The findings a new exam form starts with: every body system, Not
 * examined, with no note.
 */
export const blankFindings = (): {
  bodySystem: string;
  status: ExamFindingStatus;
  notes: string;
}[] =>
  EXAM_BODY_SYSTEMS.map(({ key }) => ({
    bodySystem: key,
    status: ExamFindingStatus.NOT_EXAMINED,
    notes: "",
  }));
