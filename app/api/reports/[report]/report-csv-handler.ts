// The GET /api/reports/[report] handler, with its session, permission and
// data dependencies passed in. `route.ts` wires the real ones; the unit tests
// (report-csv-handler.test.ts) pass fakes, since the real ones need a request
// context and a database.
import { z } from "zod";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import {
  ReportParamsSchema,
  SacReportParamsSchema,
} from "@/app/lib/zod-schemas/report.schemas";
import { REPORT_EXPORTS, type ReportExport } from "@/app/lib/utils/report-href";
import {
  reportCsvFileName,
  type ReportCsvContext,
} from "@/app/lib/utils/report-csv";

/**
 * What the report's page reads from its URL: the period and species, or, for
 * the Shelter Animals Count report, the month alone.
 */
export type ReportFilters = {
  from?: string;
  to?: string;
  species?: string;
  month?: string;
};

export type ReportCsvHandlerDeps = {
  getSession: () => Promise<{ user?: unknown } | null>;
  hasPermission: (permission: AppPermission) => Promise<boolean>;
  /** The period, species names and time zone the file says it covers. */
  loadContext: (
    report: ReportExport,
    filters: ReportFilters,
  ) => Promise<ReportCsvContext>;
  /** The report's CSV text, counted by the same fetcher as its page. */
  buildCsv: (
    report: ReportExport,
    filters: ReportFilters,
    context: ReportCsvContext,
  ) => Promise<string>;
};

// On every answer, errors included: a report is for this viewer only and is
// never kept by a browser or a proxy.
const PRIVATE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" },
  });

const ReportSchema = z.enum(REPORT_EXPORTS);

/**
 * The query string as a page's `searchParams` gives it: a key given more
 * than once becomes an array. `ReportParamsSchema` refuses an array, so a
 * repeated filter falls back to the defaults here exactly as on the page,
 * rather than one of its values winning.
 */
export function searchParamsRecord(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
}

/**
 * Serves a report as a CSV file, for the period and species in the query
 * string (the month, for the SAC report), read the same forgiving way as the
 * report's page.
 *
 * Whoever may read the reports (`REPORTS_READ`) may download them: the file
 * holds nothing the page doesn't. Signed out answers 401; signed in without
 * the permission, 403; a report that doesn't exist, 404.
 */
export const createReportCsvHandler =
  ({ getSession, hasPermission, loadContext, buildCsv }: ReportCsvHandlerDeps) =>
  async (request: Request, reportParam: string): Promise<Response> => {
    const session = await getSession();
    if (!session?.user) return text("Sign in to download reports.", 401);
    if (!(await hasPermission(AppPermissions.REPORTS_READ))) {
      return text("You don't have permission to download reports.", 403);
    }

    const parsedReport = ReportSchema.safeParse(reportParam);
    if (!parsedReport.success) return text("Not found.", 404);
    const report = parsedReport.data;

    // The SAC report takes a month and nothing else; the others a period
    // and species, and never a month.
    const parsed = (
      report === "sac" ? SacReportParamsSchema : ReportParamsSchema
    ).safeParse(searchParamsRecord(new URL(request.url).searchParams));
    const filters: ReportFilters = parsed.success ? parsed.data : {};

    try {
      const context = await loadContext(report, filters);
      const csv = await buildCsv(report, filters, context);
      return new Response(csv, {
        headers: {
          ...PRIVATE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${reportCsvFileName(
            report,
            context.range,
          )}"`,
        },
      });
    } catch (error) {
      console.error(`Failed to build the ${report} report CSV:`, error);
      return text("This report couldn't be downloaded.", 500);
    }
  };
