import { Suspense } from "react";

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

interface Props {
  searchParams: SearchParamsType;
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
  // A mangled URL falls back to the default (year-to-date)
  const parsed = ReportParamsSchema.safeParse(raw);
  const { from, to, species } = parsed.success ? parsed.data : {};

  const range = resolveReportRange(from, to);
  const speciesList = await fetchSpecies();
  const speciesOptions = speciesList.map((s) => ({
    label: s.name,
    value: s.id,
  }));

  const cardParams = { from, to, species };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Historical and compliance statistics over a date range you choose.
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
    </div>
  );
};

export default Page;
