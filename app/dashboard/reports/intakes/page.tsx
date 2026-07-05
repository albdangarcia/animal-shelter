import Link from "next/link";

import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import { ReportParamsSchema } from "@/app/lib/zod-schemas/report.schemas";
import {
  formatRangeLabel,
  resolveReportRange,
} from "@/app/lib/utils/report-date-utils";
import { SHELTER_TIMEZONE } from "@/app/lib/constants/constants";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchIntakeReport } from "@/app/lib/data/reports/intake-report.data";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ReportRangePicker } from "@/components/dashboard/reports/report-range-picker";
import { IntakeTrendChart } from "@/components/dashboard/reports/intake-trend-chart";
import type { IntakeReportRow } from "@/app/lib/data/reports/intake-report.data";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Props {
  searchParams: SearchParamsType;
}

/** Builds the overview href, preserving the current range/species params. */
function overviewHref({
  from,
  to,
  species,
}: {
  from?: string;
  to?: string;
  species?: string;
}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (species) params.set("species", species);
  const qs = params.toString();
  return qs ? `/dashboard/reports?${qs}` : "/dashboard/reports";
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.REPORTS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const raw = await searchParams;
  // Forgiving parse: a mangled URL falls back to the default (year-to-date)
  // range rather than erroring. The fetcher re-validates independently.
  const parsed = ReportParamsSchema.safeParse(raw);
  const { from, to, species } = parsed.success ? parsed.data : {};

  const range = resolveReportRange(from, to);
  const [speciesList, report] = await Promise.all([
    fetchSpecies(),
    fetchIntakeReport(from, to, species),
  ]);
  const speciesOptions = speciesList.map((s) => ({
    label: s.name,
    value: s.id,
  }));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={overviewHref({ from, to, species })}>Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Intake sources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Intake sources
          </h1>
          <p className="text-muted-foreground text-sm">
            Where animals came from and how intakes trended over the selected
            period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formatRangeLabel(range)}</span>
          <span className="text-muted-foreground text-xs">
            · Times counted in {SHELTER_TIMEZONE}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <ReportRangePicker />
            <ServerSideFacetedFilter
              title="Species"
              paramKey="species"
              options={speciesOptions}
            />
            {/* Room reserved here for a future CSV/PDF export button. */}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <MetricCard label="Total intakes" value={`${report.total}`} />
        <MetricCard
          label="Largest source"
          value={
            report.largestSource
              ? formatSingleEnumOption(report.largestSource.type)
              : "—"
          }
          hint={
            report.largestSource
              ? `${report.largestSource.count} intake${
                  report.largestSource.count === 1 ? "" : "s"
                }`
              : undefined
          }
        />
        <MetricCard label="Transfers in" value={`${report.transfersIn}`} />
      </div>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Monthly intake trend</CardTitle>
          <CardDescription>
            Total intakes per calendar month over the selected period.
          </CardDescription>
        </CardHeader>
        <div className="px-2 pb-4 sm:px-6 sm:pb-6">
          <IntakeTrendChart data={report.monthlySeries} />
        </div>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Intakes by source type</CardTitle>
          <CardDescription>
            Count and share of total for each intake type in the period.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <IntakeBreakdown rows={report.byType} />
        </div>
      </Card>

      {report.topPartners.length > 0 && (
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Top transfer-in partners</CardTitle>
            <CardDescription>
              Source partners for transfers in during the period, by count.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Transfers in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topPartners.map((partner) => (
                  <TableRow key={partner.partnerId}>
                    <TableCell className="font-medium">
                      {partner.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {partner.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <p className="text-muted-foreground text-xs">
        Date boundaries computed in {SHELTER_TIMEZONE}; months are calendar
        months in that zone.
      </p>
    </div>
  );
};

/**
 * Intakes-by-type breakdown as a server-rendered horizontal bar list — one row
 * per intake type present in the period, each showing its share of total
 * intakes. No client JS required.
 */
function IntakeBreakdown({ rows }: { rows: IntakeReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No intakes recorded in this period.
      </p>
    );
  }

  // Scale bar widths to the largest slice so the chart uses its full width even
  // when no single type dominates; the printed percent is always of the total.
  const maxPercent = Math.max(...rows.map((r) => r.percentOfTotal));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const percent = row.percentOfTotal * 100;
        const width =
          maxPercent > 0 ? (row.percentOfTotal / maxPercent) * 100 : 0;
        return (
          <div key={row.type} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">
                {formatSingleEnumOption(row.type)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {row.count} · {percent.toFixed(1)}%
              </span>
            </div>
            <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl tabular-nums @[250px]/card:text-3xl",
            valueClassName,
          )}
        >
          {value}
        </CardTitle>
        {hint && (
          <p className="text-muted-foreground text-xs tabular-nums">{hint}</p>
        )}
      </CardHeader>
    </Card>
  );
}

export default Page;
