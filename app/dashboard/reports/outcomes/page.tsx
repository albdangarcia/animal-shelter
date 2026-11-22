import Link from "next/link";

import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import {
  pickedSpeciesNames,
  reportHref,
  speciesLabel,
} from "@/app/lib/utils/report-href";
import { ReportParamsSchema } from "@/app/lib/zod-schemas/report.schemas";
import {
  formatRangeLabel,
  resolveReportRange,
} from "@/app/lib/utils/report-date-utils";
import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { formatPercent } from "@/app/lib/utils/report-rate-utils";
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchOutcomeReport } from "@/app/lib/data/reports/outcome-report.data";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ReportRangePicker } from "@/components/dashboard/reports/report-range-picker";
import { OutcomeBreakdown } from "@/components/dashboard/reports/outcome-breakdown";
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
import { HelpLink } from "@/components/dashboard/help/help-link";
import { ReportDownloadLink } from "@/components/dashboard/reports/report-download-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.REPORTS_READ}
      fallback={<StatusPage type="accessDenied" />}
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

  const timezone = (await getShelterSettings()).timezone;
  const range = resolveReportRange(from, to, await getShelterToday());
  const [speciesList, report, help] = await Promise.all([
    fetchSpecies(),
    fetchOutcomeReport(from, to, species),
    getHelpLinkGuide(PAGE_HELP_GUIDES.reportOutcomes),
  ]);
  const speciesOptions = speciesList.map((s) => ({
    label: s.name,
    value: s.id,
  }));

  const rateIsHigh =
    report.liveReleaseRate !== null && report.liveReleaseRate >= 0.9;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Breadcrumb className="print:hidden">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={reportHref("/dashboard/reports", { from, to, species })}>Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Outcome statistics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Outcome statistics
            </h1>
            <p className="text-muted-foreground text-sm">
              Live release rate and outcome breakdown over the selected period.
            </p>
          </div>
          <div className="print:hidden">
            <HelpLink guide={help} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formatRangeLabel(range)}</span>
          <span className="text-muted-foreground text-xs">
            · Times counted in {timezone}
          </span>
          {/* The species filter is left out of a printout; this says what it
              picked instead. */}
          <span className="text-muted-foreground hidden text-xs print:inline">
            · {speciesLabel(pickedSpeciesNames(speciesList, species))}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto print:hidden">
            <ReportRangePicker />
            <ServerSideFacetedFilter
              title="Species"
              paramKey="species"
              options={speciesOptions}
            />
            <ReportDownloadLink
              report="outcomes"
              params={{ from, to, species }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <MetricCard
          label="Live release rate"
          value={formatPercent(report.liveReleaseRate)}
          valueClassName={
            rateIsHigh ? "text-green-600 dark:text-green-400" : undefined
          }
        />
        <MetricCard label="Total outcomes" value={`${report.total}`} />
        <MetricCard label="Live outcomes" value={`${report.liveCount}`} />
        <MetricCard label="Non-live outcomes" value={`${report.nonLiveCount}`} />
      </div>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Outcomes by type</CardTitle>
          <CardDescription>
            Count and share of total for each outcome type in the period.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <OutcomeBreakdown rows={report.rows} />
        </div>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Outcome detail</CardTitle>
          <CardDescription>
            Percent of live is shown for live-release outcome types only.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outcome type</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">% of total</TableHead>
                <TableHead className="text-right">% of live</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground text-center"
                  >
                    No outcomes recorded in this period.
                  </TableCell>
                </TableRow>
              ) : (
                report.rows.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="font-medium">
                      {formatSingleEnumOption(row.type)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.percentOfTotal)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        !row.isLive && "text-muted-foreground",
                      )}
                    >
                      {row.isLive ? formatPercent(row.percentOfLive) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-muted-foreground text-xs">
        Live release rate = (adoption + return to owner + transfer out) ÷ total
        outcomes, following Shelter Animals Count conventions. Euthanized,
        deceased, and other count as non-live. Date boundaries computed in{" "}
        {timezone}.
      </p>
    </div>
  );
};

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
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
      </CardHeader>
    </Card>
  );
}

export default Page;
