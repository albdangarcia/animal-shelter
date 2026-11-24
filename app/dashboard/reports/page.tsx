import { Suspense } from "react";
import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";

import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import {
  pickedSpeciesNames,
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
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ReportRangePicker } from "@/components/dashboard/reports/report-range-picker";
import {
  IntakeSourcesCard,
  IntakeVsOutcomeCard,
  LengthOfStayCard,
  OutcomeStatisticsCard,
  OverviewCardSkeleton,
} from "@/components/dashboard/reports/overview-cards";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { ReportDownloadLink } from "@/components/dashboard/reports/report-download-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  // A mangled URL falls back to the default (year-to-date)
  const parsed = ReportParamsSchema.safeParse(raw);
  const { from, to, species } = parsed.success ? parsed.data : {};

  const timezone = (await getShelterSettings()).timezone;
  const range = resolveReportRange(from, to, await getShelterToday());
  const [speciesList, help] = await Promise.all([
    fetchSpecies(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.reports),
  ]);
  const speciesOptions = speciesList.map((s) => ({
    label: s.name,
    value: s.id,
  }));

  const cardParams = { from, to, species };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
            <p className="text-muted-foreground text-sm">
              Historical and compliance statistics over a date range you choose.
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
              report="overview"
              params={{ from, to, species }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Suspense fallback={<OverviewCardSkeleton />}>
          <OutcomeStatisticsCard {...cardParams} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton />}>
          <IntakeVsOutcomeCard {...cardParams} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton />}>
          <LengthOfStayCard {...cardParams} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton />}>
          <IntakeSourcesCard {...cardParams} />
        </Suspense>
      </div>

      {/* A month, not the period and species above, so it keeps neither. */}
      <Link
        href="/dashboard/reports/shelter-animals-count"
        className="block print:hidden"
      >
        <Card className="transition-colors hover:border-primary/40">
          <CardHeader>
            <CardTitle>Shelter Animals Count</CardTitle>
            <CardDescription>
              One month&apos;s intakes, outcomes and counts by species and
              age, laid out like Shelter Animals Count&apos;s monthly form.
            </CardDescription>
            <CardAction>
              <IconArrowUpRight className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
};

export default Page;
