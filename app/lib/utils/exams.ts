// What an animal's exams say, worked out from its completed exams when
// someone looks: which was the latest, what the latest one to look said
// about whether it is intact, and which belong to the current stay.

import type {
  ExamResult,
  ExamType,
  ReproductiveStatus,
} from "@/prisma/generated/enums";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/** One of the animal's exams that was done and isn't voided. */
export interface ExamFact {
  entryId: string;
  examType: ExamType;
  completedDate: CalendarDay;
  overallResult: ExamResult;
  reproductiveStatus: ReproductiveStatus | null;
  createdAt: Date;
}

/** What the latest exam to look found about the animal being intact. */
export interface ReproductiveFinding {
  entryId: string;
  examDate: CalendarDay;
  status: ReproductiveStatus;
}

/**
 * Newest first: the later day, then the one recorded later, then by id, so
 * two exams on one day always come out in the same order.
 */
const newestFirst = (a: ExamFact, b: ExamFact) =>
  b.completedDate.localeCompare(a.completedDate) ||
  b.createdAt.getTime() - a.createdAt.getTime() ||
  (a.entryId < b.entryId ? 1 : a.entryId > b.entryId ? -1 : 0);

/** The exams, newest first. */
export const examsNewestFirst = (exams: ExamFact[]): ExamFact[] =>
  [...exams].sort(newestFirst);

/** The latest exam, or null when there is none. */
export const latestExam = (exams: ExamFact[]): ExamFact | null =>
  examsNewestFirst(exams)[0] ?? null;

/**
 * The reproductive status the latest exam that recorded one found, or null.
 * An exam that didn't look leaves the one before it standing.
 */
export const latestReproductiveFinding = (
  exams: ExamFact[],
): ReproductiveFinding | null => {
  const exam = examsNewestFirst(exams).find(
    (fact) => fact.reproductiveStatus !== null,
  );
  return exam
    ? {
        entryId: exam.entryId,
        examDate: exam.completedDate,
        status: exam.reproductiveStatus!,
      }
    : null;
};

/**
 * The exams done during the stay that began on `stayStartDay`, newest first:
 * those dated on or after it.
 */
export const stayExams = (
  exams: ExamFact[],
  stayStartDay: CalendarDay,
): ExamFact[] =>
  examsNewestFirst(exams).filter((exam) => exam.completedDate >= stayStartDay);
