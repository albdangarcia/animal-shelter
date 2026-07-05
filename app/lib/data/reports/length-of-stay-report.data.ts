import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import { computeStays } from "@/app/lib/utils/stay-utils";
import { _fetchAnimalStayEvents, parseSpeciesIds } from "./report-shared.data";

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
  intakeDate: Date; // intake date of the currently open stay
};

export type LengthOfStayReport = {
  // Compliance stats over stays whose OUTCOME fell inside the selected period.
  medianDays: number | null; // null → no completed stays in range ("—")
  longestCompletedDays: number | null; // null when no completed stays in range
  completedCount: number;
  histogram: LosHistogramBucket[];
  inCareNow: number; // full in-care count (not the sliced worklist)
  over90: number; // in-care animals whose open stay exceeds 90 days
  worklist: LongestStayRow[]; // longest current stays, desc, top 20
  fromLabel: string;
  toLabel: string;
};

/**
 * Length-of-stay statistics for the selected range and species filter.
 *
 * DELIBERATE ASYMMETRY (decision record): the median/max/histogram cover only
 * completed stays whose outcome fell inside the selected period (the compliance
 * framing), while the in-care worklist and its counts are always "as of now",
 * independent of the range. This is intentional — do NOT filter the worklist to
 * the range to make them symmetric.
 *
 * In-care status is derived purely from the intake/outcome pairing
 * ([[stay-utils]]), never from `listingStatus`, so animals that are DRAFT or
 * ARCHIVED but physically present still count.
 */
const _fetchLengthOfStayReport = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<LengthOfStayReport> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);
    const now = new Date();

    // PERF: this walks every animal's full intake/outcome history in memory
    // (O(animals)). Acceptable at current shelter scale. Optimization candidate:
    // the completed-stay stats could restrict the fetch to animals with an
    // outcome in range, but the worklist still needs all in-care animals — so a
    // future rollup/stay table is the cleaner win than a narrower fetch here.
    const animals = await _fetchAnimalStayEvents(speciesIds);

    const completedStayDays: number[] = [];
    const inCareRows: LongestStayRow[] = [];

    for (const animal of animals) {
      const { stays, isInCare, currentStayDays, cumulativeDays } = computeStays(
        animal.events,
        now,
      );

      // Compliance stats: every completed stay whose outcome falls in-range.
      // An animal may contribute more than one stay.
      for (const stay of stays) {
        if (
          stay.outcomeDate &&
          stay.outcomeDate >= range.gte &&
          stay.outcomeDate < range.lt
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
      fromLabel: range.fromLabel,
      toLabel: range.toLabel,
    };
  } catch (error) {
    console.error("Error fetching length of stay report.", error);
    throw new Error("Error fetching length of stay report.");
  }
};

export const fetchLengthOfStayReport = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchLengthOfStayReport);
