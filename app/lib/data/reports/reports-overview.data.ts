import { prisma } from "@/app/lib/prisma";
import { IntakeType, OutcomeType } from "@prisma/client";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import { computeStays } from "@/app/lib/utils/stay-utils";
import {
  _fetchAnimalStayEvents,
  isLiveOutcome,
  parseSpeciesIds,
  speciesWhere,
} from "./report-shared.data";

// An in-care stay past this many days is flagged as long-staying on the card.
const LONG_STAY_DAY_THRESHOLD = 90;

/** Median of a numeric list, or `null` for an empty list (displays as "—"). */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Outcome statistics — live release rate + top outcome types.
// ---------------------------------------------------------------------------

export type OutcomeSummary = {
  total: number;
  liveCount: number;
  liveReleaseRate: number; // 0..1; 0 when there are no outcomes (never NaN)
  topTypes: { type: OutcomeType; count: number }[]; // up to 3, desc by count
};

const _fetchOutcomeSummary = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<OutcomeSummary> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);

    const grouped = await prisma.outcome.groupBy({
      by: ["type"],
      where: {
        outcomeDate: { gte: range.gte, lt: range.lt },
        ...speciesWhere(speciesIds),
      },
      _count: { id: true },
    });

    const counts = grouped.map((g) => ({ type: g.type, count: g._count.id }));
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const liveCount = counts
      .filter((c) => isLiveOutcome(c.type))
      .reduce((sum, c) => sum + c.count, 0);
    const liveReleaseRate = total === 0 ? 0 : liveCount / total;
    const topTypes = [...counts]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { total, liveCount, liveReleaseRate, topTypes };
  } catch (error) {
    console.error("Error fetching outcome summary.", error);
    throw new Error("Error fetching outcome summary.");
  }
};

// ---------------------------------------------------------------------------
// Intake sources — total intakes + top intake types.
// ---------------------------------------------------------------------------

export type IntakeSummary = {
  total: number;
  topTypes: { type: IntakeType; count: number }[]; // up to 2, desc by count
};

const _fetchIntakeSummary = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<IntakeSummary> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);

    const grouped = await prisma.intake.groupBy({
      by: ["type"],
      where: {
        intakeDate: { gte: range.gte, lt: range.lt },
        ...speciesWhere(speciesIds),
      },
      _count: { id: true },
    });

    const counts = grouped.map((g) => ({ type: g.type, count: g._count.id }));
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const topTypes = [...counts]
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);

    return { total, topTypes };
  } catch (error) {
    console.error("Error fetching intake summary.", error);
    throw new Error("Error fetching intake summary.");
  }
};

// ---------------------------------------------------------------------------
// Intake vs outcome balance — in / out / net over the period.
// ---------------------------------------------------------------------------

export type BalanceSummary = {
  intakes: number;
  outcomes: number;
  net: number; // intakes − outcomes (positive = net growth in care)
};

const _fetchBalanceSummary = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<BalanceSummary> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);
    const filter = speciesWhere(speciesIds);

    const [intakes, outcomes] = await Promise.all([
      prisma.intake.count({
        where: { intakeDate: { gte: range.gte, lt: range.lt }, ...filter },
      }),
      prisma.outcome.count({
        where: { outcomeDate: { gte: range.gte, lt: range.lt }, ...filter },
      }),
    ]);

    return { intakes, outcomes, net: intakes - outcomes };
  } catch (error) {
    console.error("Error fetching balance summary.", error);
    throw new Error("Error fetching balance summary.");
  }
};

// ---------------------------------------------------------------------------
// Length of stay — median of completed stays + in-care worklist counts.
// ---------------------------------------------------------------------------

export type LengthOfStaySummary = {
  medianDays: number | null; // null → no completed stays in range ("—")
  inCareNow: number;
  over90: number; // in-care animals whose current stay exceeds 90 days
};

const _fetchLengthOfStaySummary = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<LengthOfStaySummary> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);
    const now = new Date();

    // PERF: this walks every animal's full intake/outcome history in memory
    // (O(animals)). Acceptable at current shelter scale; if the animal count
    // grows large, promote this to a precomputed stay table or a SQL rollup.
    const animals = await _fetchAnimalStayEvents(speciesIds);

    const completedStayDays: number[] = [];
    let inCareNow = 0;
    let over90 = 0;

    for (const animal of animals) {
      const { stays, isInCare, currentStayDays } = computeStays(
        animal.events,
        now,
      );

      // Headline median counts completed stays whose outcome falls in-range.
      for (const stay of stays) {
        if (
          stay.outcomeDate &&
          stay.outcomeDate >= range.gte &&
          stay.outcomeDate < range.lt
        ) {
          completedStayDays.push(stay.days);
        }
      }

      if (isInCare) {
        inCareNow += 1;
        if ((currentStayDays ?? 0) > LONG_STAY_DAY_THRESHOLD) over90 += 1;
      }
    }

    return { medianDays: median(completedStayDays), inCareNow, over90 };
  } catch (error) {
    console.error("Error fetching length of stay summary.", error);
    throw new Error("Error fetching length of stay summary.");
  }
};

export const fetchOutcomeSummary = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchOutcomeSummary);

export const fetchIntakeSummary = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchIntakeSummary);

export const fetchBalanceSummary = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchBalanceSummary);

export const fetchLengthOfStaySummary = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchLengthOfStaySummary);
