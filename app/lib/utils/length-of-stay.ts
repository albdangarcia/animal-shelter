// The length-of-stay report's arithmetic, apart from its fetch: pure, with no
// Prisma or auth imports, so it is unit-tested (length-of-stay.test.ts). The
// fetch and the permission check stay in [[length-of-stay-report.data]].

import { computeStays, type StayEvent } from "./stay-utils";
import type { CalendarDay } from "./shelter-day";
import type { ReportRange } from "./report-date-utils";

// An open stay past this many days is counted as long-staying. Must match the
// overview card's threshold ([[reports-overview.data]]) so the two agree.
const LONG_STAY_DAY_THRESHOLD = 90;

// Number of animals shown in the "longest current stays" worklist.
const WORKLIST_LIMIT = 20;

/** Median of a numeric list, or `null` for an empty list (displays as "—"). */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Histogram buckets over completed-stay durations, in render order. Boundaries
// are inclusive of the upper number except the final open-ended "90+" bucket,
// which counts stays STRICTLY over 90 days — matching the `over90` threshold so
// the last bar and the "in care over 90 days" card use the same 90-day line.
type BucketDef = { label: string; test: (days: number) => boolean };
const HISTOGRAM_BUCKETS: readonly BucketDef[] = [
  { label: "0–7", test: (d) => d <= 7 },
  { label: "8–30", test: (d) => d > 7 && d <= 30 },
  { label: "31–90", test: (d) => d > 30 && d <= 90 },
  { label: "90+", test: (d) => d > 90 },
];

export type LosHistogramBucket = {
  label: string; // e.g. "0–7"
  count: number;
};

export type LongestStayRow = {
  animalId: string;
  name: string;
  speciesName: string;
  currentStayDays: number;
  cumulativeDays: number;
  // True when the animal has returned before, so cumulative > current and the
  // UI shows the cumulative column; false renders "same"/blank.
  hasPriorStays: boolean;
  intakeDate: CalendarDay; // intake date of the currently open stay
};

export type LengthOfStayStats = {
  // Compliance stats over stays whose OUTCOME fell inside the selected period.
  medianDays: number | null; // null → no completed stays in range ("—")
  longestCompletedDays: number | null; // null when no completed stays in range
  completedCount: number;
  histogram: LosHistogramBucket[];
  inCareNow: number; // full in-care count (not the sliced worklist)
  over90: number; // in-care animals whose open stay exceeds 90 days
  worklist: LongestStayRow[]; // longest current stays, desc, top 20
};

/** One animal and its intake/outcome history, as the report reads it. */
export type AnimalStayHistory = {
  id: string;
  name: string;
  speciesName: string;
  events: StayEvent[];
};

/**
 * The report's statistics from every animal's history, as of `today`: the
 * completed-stay stats over `range`, and the in-care worklist and counts as of
 * now (the deliberate asymmetry is recorded on `fetchLengthOfStayReport`).
 */
export function summarizeLengthOfStay(
  animals: readonly AnimalStayHistory[],
  range: ReportRange,
  today: CalendarDay,
): LengthOfStayStats {
  const completedStayDays: number[] = [];
  const inCareRows: LongestStayRow[] = [];

  for (const animal of animals) {
    const { stays, isInCare, currentStayDays, cumulativeDays } = computeStays(
      animal.events,
      today,
    );

    // Compliance stats: every completed stay whose outcome falls in-range.
    // An animal may contribute more than one stay.
    for (const stay of stays) {
      if (
        stay.outcomeDate &&
        stay.outcomeDate >= range.fromLabel &&
        stay.outcomeDate <= range.toLabel
      ) {
        completedStayDays.push(stay.days);
      }
    }

    // Worklist: current open stay, always as of now.
    if (isInCare) {
      const openStay = stays[stays.length - 1];
      inCareRows.push({
        animalId: animal.id,
        name: animal.name,
        speciesName: animal.speciesName,
        currentStayDays: currentStayDays ?? 0,
        cumulativeDays,
        hasPriorStays: cumulativeDays !== (currentStayDays ?? 0),
        intakeDate: openStay.intakeDate,
      });
    }
  }

  const histogram: LosHistogramBucket[] = HISTOGRAM_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: completedStayDays.filter((days) => bucket.test(days)).length,
  }));

  // Sort the full in-care set before slicing, but derive the counts from the
  // unsliced set so they reflect every in-care animal, not just the top 20.
  inCareRows.sort(
    (a, b) =>
      b.currentStayDays - a.currentStayDays ||
      b.cumulativeDays - a.cumulativeDays ||
      a.name.localeCompare(b.name),
  );
  const over90 = inCareRows.filter(
    (row) => row.currentStayDays > LONG_STAY_DAY_THRESHOLD,
  ).length;

  return {
    medianDays: median(completedStayDays),
    longestCompletedDays:
      completedStayDays.length === 0 ? null : Math.max(...completedStayDays),
    completedCount: completedStayDays.length,
    histogram,
    inCareNow: inCareRows.length,
    over90,
    worklist: inCareRows.slice(0, WORKLIST_LIMIT),
  };
}
