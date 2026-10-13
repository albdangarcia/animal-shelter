import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExamResult,
  ExamType,
  ReproductiveStatus,
} from "@/prisma/generated/enums";
import { calendarDay } from "./shelter-day";
import {
  latestExam,
  latestReproductiveFinding,
  stayExams,
  type ExamFact,
} from "./exams";

const exam = (
  entryId: string,
  completedDate: string,
  createdAt: string,
  overrides: Partial<ExamFact> = {},
): ExamFact => ({
  entryId,
  examType: ExamType.VET,
  completedDate: calendarDay(completedDate),
  overallResult: ExamResult.NO_CONCERNS,
  reproductiveStatus: null,
  createdAt: new Date(createdAt),
  ...overrides,
});

test("the latest exam is the one done last, then the one recorded last on that day, then by id", () => {
  const early = exam("a", "2026-10-01", "2026-10-09T10:00:00Z");
  const sameDayFirst = exam("b", "2026-10-05", "2026-10-05T09:00:00Z");
  const sameDayLater = exam("c", "2026-10-05", "2026-10-05T15:00:00Z");
  // Recorded last of all, but for an earlier day.
  const backdated = exam("d", "2026-10-02", "2026-10-10T08:00:00Z");
  assert.equal(latestExam([early, sameDayLater, backdated, sameDayFirst])?.entryId, "c");
  assert.equal(latestExam([]), null);

  const tieA = exam("x", "2026-10-05", "2026-10-05T15:00:00Z");
  const tieB = exam("y", "2026-10-05", "2026-10-05T15:00:00Z");
  assert.equal(latestExam([tieA, tieB])?.entryId, "y");
  assert.equal(latestExam([tieB, tieA])?.entryId, "y");
});

test("the latest reproductive finding skips exams that didn't record one", () => {
  const intact = exam("a", "2026-09-01", "2026-09-01T10:00:00Z", {
    reproductiveStatus: ReproductiveStatus.INTACT,
  });
  const silent = exam("b", "2026-10-01", "2026-10-01T10:00:00Z");
  assert.deepEqual(latestReproductiveFinding([silent, intact]), {
    entryId: "a",
    examDate: "2026-09-01",
    status: ReproductiveStatus.INTACT,
  });
  const altered = exam("c", "2026-10-03", "2026-10-03T10:00:00Z", {
    reproductiveStatus: ReproductiveStatus.ALTERED,
  });
  assert.equal(
    latestReproductiveFinding([intact, silent, altered])?.status,
    ReproductiveStatus.ALTERED,
  );
  assert.equal(latestReproductiveFinding([silent]), null);
});

test("the stay's exams are those dated on or after the day it began, newest first", () => {
  const before = exam("a", "2026-07-31", "2026-07-31T10:00:00Z");
  const onTheDay = exam("b", "2026-08-01", "2026-08-01T10:00:00Z");
  const later = exam("c", "2026-08-20", "2026-08-20T10:00:00Z");
  assert.deepEqual(
    stayExams([onTheDay, before, later], calendarDay("2026-08-01")).map(
      (fact) => fact.entryId,
    ),
    ["c", "b"],
  );
});
