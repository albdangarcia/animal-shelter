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
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchLengthOfStayReport } from "@/app/lib/data/reports/length-of-stay-report.data";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ReportRangePicker } from "@/components/dashboard/reports/report-range-picker";
import { LosHistogram } from "@/components/dashboard/reports/los-histogram";
import { LongestStaysTable } from "@/components/dashboard/reports/longest-stays-table";
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
    fetchLengthOfStayReport(from, to, species),
    getHelpLinkGuide(PAGE_HELP_GUIDES.reportLengthOfStay),
  ]);
  const speciesOptions = speciesList.map((s) => ({
    label: s.name,
    value: s.id,
  }));

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
            <BreadcrumbPage>Length of stay</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Length of stay
            </h1>
            <p className="text-muted-foreground text-sm">
              Completed-stay statistics use the selected period; the waiting list
              reflects animals in care today.
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
              report="length-of-stay"
              params={{ from, to, species }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <MetricCard
          label="Median days in care"
          value={report.medianDays === null ? "—" : `${report.medianDays}`}
          hint="Completed stays in period"
        />
        <MetricCard
          label="Longest completed stay"
          value={
            report.longestCompletedDays === null
              ? "—"
              : `${report.longestCompletedDays}`
          }
          hint="Days, in period"
        />
        <MetricCard
          label="Animals in care now"
          value={`${report.inCareNow}`}
          hint="As of today"
        />
        <MetricCard
          label="In care over 90 days"
          value={`${report.over90}`}
          hint="As of today"
          valueClassName={
            report.over90 > 0 ? "text-amber-600 dark:text-amber-400" : undefined
          }
        />
      </div>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Completed-stay length distribution</CardTitle>
          <CardDescription>
            How long animals that left in this period stayed, bucketed by days.
          </CardDescription>
        </CardHeader>
        <div className="px-2 pb-4 sm:px-6 sm:pb-6">
          <LosHistogram
            data={report.histogram}
            completedCount={report.completedCount}
          />
        </div>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Longest current stays</CardTitle>
          <CardDescription>
            Animals in care today, longest-waiting first (top 20). Reflects today
            regardless of the selected period.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <LongestStaysTable rows={report.worklist} />
        </div>
      </Card>

      <p className="text-muted-foreground text-xs">
        Median and histogram cover stays that ended within the selected period. A
        stay runs from an intake to its next outcome; repeat visits are separate
        stays; cumulative is the sum of an animal&apos;s stays. Same-day intake and
        outcome counts as 0 days. In-care status is derived from intake/outcome
        records. Date boundaries computed in {timezone}.
      </p>
    </div>
  );
};

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
