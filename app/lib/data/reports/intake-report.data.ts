import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { prisma } from "@/app/lib/prisma";
import { IntakeType } from "@prisma/client";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import { SHELTER_TIMEZONE } from "@/app/lib/constants/constants";
import { parseSpeciesIds, speciesWhere } from "./report-shared.data";

// Maximum number of source partners listed in the transfers-in table.
const TOP_PARTNER_LIMIT = 10;

export type IntakeReportRow = {
  type: IntakeType;
  count: number;
  percentOfTotal: number; // 0..1
};

// One calendar month in the range: `month` is the sort/bucket key, `label` the
// display string, `count` the number of intakes recorded that month.
export type MonthlyIntakePoint = {
  month: string; // "2026-03"
  label: string; // "Mar 2026"
  count: number;
};

export type IntakePartnerRow = {
  partnerId: string;
  name: string;
  count: number;
};

export type IntakeReport = {
  total: number;
  transfersIn: number;
  // The single largest intake type in the period, or null when empty.
  largestSource: { type: IntakeType; count: number } | null;
  // One row per intake type present in the period, ordered by count desc.
  byType: IntakeReportRow[];
  // Continuous, zero-filled series from the first to last month of the range.
  monthlySeries: MonthlyIntakePoint[];
  // Up to 10 TRANSFER_IN source partners, ordered by count desc. Empty when the
  // period has no transfers in.
  topPartners: IntakePartnerRow[];
  fromLabel: string;
  toLabel: string;
};

/**
 * Continuous list of `"yyyy-MM"` month keys from `fromLabel`'s month through
 * `toLabel`'s month, inclusive. The labels are already resolved in the shelter
 * timezone, so their month prefix is the correct calendar month for that zone.
 */
function monthKeysInRange(fromLabel: string, toLabel: string): string[] {
  let [year, month] = fromLabel.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = toLabel.slice(0, 7).split("-").map(Number);

  const keys: string[] = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** Display label for a `"yyyy-MM"` month key, e.g. `"Mar 2026"`. */
function monthLabel(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMM yyyy");
}

/**
 * Intake statistics for the selected range and species filter: a per-type
 * breakdown, a month-by-month trend, and the top source partners for transfers
 * in. Shares its range resolution and `where` shape with the overview intake
 * card ([[reports-overview.data]]), so the two surfaces always agree on totals.
 */
const _fetchIntakeReport = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<IntakeReport> => {
  try {
    const range = resolveReportRange(from, to);
    const speciesIds = parseSpeciesIds(species);
    const where = {
      intakeDate: { gte: range.gte, lt: range.lt },
      ...speciesWhere(speciesIds),
    };

    // PERF: fetching bare intake dates for the trend is fine at shelter scale (a
    // busy shelter is thousands of intakes/year, not millions).
    const [grouped, intakeDates, partnerGroups] = await Promise.all([
      prisma.intake.groupBy({
        by: ["type"],
        where,
        _count: { id: true },
      }),
      prisma.intake.findMany({
        where,
        select: { intakeDate: true },
      }),
      prisma.intake.groupBy({
        by: ["sourcePartnerId"],
        where: {
          ...where,
          type: IntakeType.TRANSFER_IN,
          sourcePartnerId: { not: null },
        },
        _count: { id: true },
      }),
    ]);

    const total = grouped.reduce((sum, g) => sum + g._count.id, 0);
    const transfersIn =
      grouped.find((g) => g.type === IntakeType.TRANSFER_IN)?._count.id ?? 0;

    const byType: IntakeReportRow[] = grouped
      .map((g) => ({
        type: g.type,
        count: g._count.id,
        percentOfTotal: total === 0 ? 0 : g._count.id / total,
      }))
      .sort((a, b) => b.count - a.count);

    const largestSource =
      byType.length > 0
        ? { type: byType[0].type, count: byType[0].count }
        : null;

    // Bucket intakes by calendar month in the shelter timezone, then emit a
    // continuous zero-filled series so the chart has no gaps. Grouping by month
    // in the DB can't express timezone-aware truncation, so we do it in JS.
    const bucket = new Map<string, number>();
    for (const { intakeDate } of intakeDates) {
      const key = formatInTimeZone(intakeDate, SHELTER_TIMEZONE, "yyyy-MM");
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
    const monthlySeries: MonthlyIntakePoint[] = monthKeysInRange(
      range.fromLabel,
      range.toLabel,
    ).map((month) => ({
      month,
      label: monthLabel(month),
      count: bucket.get(month) ?? 0,
    }));

    // Resolve the top source partners to names with one findMany on ids.
    const sortedPartners = partnerGroups
      .filter(
        (g): g is typeof g & { sourcePartnerId: string } =>
          g.sourcePartnerId !== null,
      )
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, TOP_PARTNER_LIMIT);

    const partnerIds = sortedPartners.map((g) => g.sourcePartnerId);
    const partners =
      partnerIds.length > 0
        ? await prisma.partner.findMany({
            where: { id: { in: partnerIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(partners.map((p) => [p.id, p.name]));

    const topPartners: IntakePartnerRow[] = sortedPartners.map((g) => ({
      partnerId: g.sourcePartnerId,
      name: nameById.get(g.sourcePartnerId) ?? "Unknown partner",
      count: g._count.id,
    }));

    return {
      total,
      transfersIn,
      largestSource,
      byType,
      monthlySeries,
      topPartners,
      fromLabel: range.fromLabel,
      toLabel: range.toLabel,
    };
  } catch (error) {
    console.error("Error fetching intake report.", error);
    throw new Error("Error fetching intake report.");
  }
};

export const fetchIntakeReport = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchIntakeReport);
