import type { NextRequest } from "next/server";
import { getCachedSession } from "@/app/lib/auth/session";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import {
  pickedSpeciesNames,
  type ReportExport,
} from "@/app/lib/utils/report-href";
import {
  intakeReportCsv,
  lengthOfStayReportCsv,
  outcomeReportCsv,
  reportsOverviewCsv,
  sacReportCsv,
  type ReportCsvContext,
} from "@/app/lib/utils/report-csv";
import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchOutcomeReport } from "@/app/lib/data/reports/outcome-report.data";
import { fetchIntakeReport } from "@/app/lib/data/reports/intake-report.data";
import { fetchLengthOfStayReport } from "@/app/lib/data/reports/length-of-stay-report.data";
import { fetchSacReport } from "@/app/lib/data/reports/sac-report.data";
import { resolveSacMonth, sacMonthDays } from "@/app/lib/utils/sac-report";
import {
  fetchBalanceSummary,
  fetchIntakeSummary,
  fetchLengthOfStaySummary,
  fetchOutcomeSummary,
} from "@/app/lib/data/reports/reports-overview.data";
import {
  createReportCsvHandler,
  type ReportFilters,
} from "./report-csv-handler";

/** What the file covers: the period the fetchers count, by the same rule. */
async function loadContext(
  report: ReportExport,
  { from, to, species, month }: ReportFilters,
): Promise<ReportCsvContext> {
  const [settings, today] = await Promise.all([
    getShelterSettings(),
    getShelterToday(),
  ]);
  if (report === "sac") {
    // The month's days; SAC counts every reported species.
    const { first, last } = sacMonthDays(resolveSacMonth(month, today));
    return {
      range: { fromLabel: first, toLabel: last },
      speciesNames: [],
      timezone: settings.timezone,
    };
  }
  return {
    range: resolveReportRange(from, to, today),
    speciesNames: pickedSpeciesNames(await fetchSpecies(), species),
    timezone: settings.timezone,
  };
}

/** The CSV text of one report, read by the same fetcher as its page. */
async function buildCsv(
  report: ReportExport,
  { from, to, species, month }: ReportFilters,
  context: ReportCsvContext,
): Promise<string> {
  switch (report) {
    case "sac":
      return sacReportCsv(await fetchSacReport(month), context);
    case "outcomes":
      return outcomeReportCsv(
        await fetchOutcomeReport(from, to, species),
        context,
      );
    case "intakes":
      return intakeReportCsv(await fetchIntakeReport(from, to, species), context);
    case "length-of-stay":
      return lengthOfStayReportCsv(
        await fetchLengthOfStayReport(from, to, species),
        context,
      );
    case "overview": {
      const [outcomes, balance, lengthOfStay, intakes] = await Promise.all([
        fetchOutcomeSummary(from, to, species),
        fetchBalanceSummary(from, to, species),
        fetchLengthOfStaySummary(from, to, species),
        fetchIntakeSummary(from, to, species),
      ]);
      return reportsOverviewCsv(
        { outcomes, balance, lengthOfStay, intakes },
        context,
      );
    }
  }
}

const handler = createReportCsvHandler({
  getSession: getCachedSession,
  hasPermission,
  loadContext,
  buildCsv,
});

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/reports/[report]">,
) {
  return handler(request, (await ctx.params).report);
}
