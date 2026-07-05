import { prisma } from "@/app/lib/prisma";
import { OutcomeType } from "@prisma/client";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import {
  isLiveOutcome,
  LIVE_OUTCOME_TYPES,
  parseSpeciesIds,
  speciesWhere,
} from "./report-shared.data";

// Display/render order for the breakdown and table: live types first (in the
// canonical Shelter Animals Count order), then the non-live types. Types with
// zero outcomes in the period are omitted by the fetcher, so the UI renders a
// subset of this list, always in this order.
const OUTCOME_TYPE_ORDER: readonly OutcomeType[] = [
  ...LIVE_OUTCOME_TYPES, // ADOPTION, RETURN_TO_OWNER, TRANSFER_OUT
  OutcomeType.EUTHANIZED,
  OutcomeType.DECEASED,
  OutcomeType.OTHER,
];

export type OutcomeReportRow = {
  type: OutcomeType;
  count: number;
  isLive: boolean;
  percentOfTotal: number; // 0..1
  percentOfLive: number | null; // 0..1 for live types; null for non-live
};

export type OutcomeReport = {
  total: number;
  liveCount: number;
  nonLiveCount: number;
  // 0..1, or null when there are no outcomes in the period (renders as "—").
  liveReleaseRate: number | null;
  // One row per outcome type present in the period, ordered live-first. Empty
  // when the period has no outcomes.
  rows: OutcomeReportRow[];
  fromLabel: string;
  toLabel: string;
};

/**
 * Outcome statistics for the selected range and species filter: the live
 * release rate plus a per-type breakdown. This is the compliance anchor — it
 * shares its range resolution and live-outcome definition with the overview
 * card ([[reports-overview.data]]), so the two surfaces always agree.
 */
const _fetchOutcomeReport = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<OutcomeReport> => {
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

    const countByType = new Map<OutcomeType, number>(
      grouped.map((g) => [g.type, g._count.id]),
    );

    const total = grouped.reduce((sum, g) => sum + g._count.id, 0);
    const liveCount = grouped
      .filter((g) => isLiveOutcome(g.type))
      .reduce((sum, g) => sum + g._count.id, 0);
    const nonLiveCount = total - liveCount;

    const rows: OutcomeReportRow[] = OUTCOME_TYPE_ORDER.filter((type) =>
      countByType.has(type),
    ).map((type) => {
      const count = countByType.get(type) ?? 0;
      const live = isLiveOutcome(type);
      return {
        type,
        count,
        isLive: live,
        percentOfTotal: total === 0 ? 0 : count / total,
        percentOfLive: live && liveCount > 0 ? count / liveCount : live ? 0 : null,
      };
    });

    return {
      total,
      liveCount,
      nonLiveCount,
      liveReleaseRate: total === 0 ? null : liveCount / total,
      rows,
      fromLabel: range.fromLabel,
      toLabel: range.toLabel,
    };
  } catch (error) {
    console.error("Error fetching outcome report.", error);
    throw new Error("Error fetching outcome report.");
  }
};

export const fetchOutcomeReport = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchOutcomeReport);
