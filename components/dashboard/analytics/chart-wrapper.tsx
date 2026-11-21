import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchChartData } from "@/app/lib/data/analytics.data";
import { ChartAreaInteractive } from "./chart-area-interactive";
import { Suspense } from "react";
import AnalyticsChartSkeleton from "@/components/skeletons/analyticsChartSkeleton";

/**
 * The analytics chart. Left out for a viewer without
 * `ANIMAL_READ_ANALYTICS`, like the home cards: its fetch would refuse them.
 */
const ChartWrapper = async () => {
  if (!(await hasPermission(AppPermissions.ANIMAL_READ_ANALYTICS))) return null;

  const chartData = await fetchChartData();

  return (
    <Suspense fallback={<AnalyticsChartSkeleton />}>
      <ChartAreaInteractive data={chartData} />
    </Suspense>
  );
};

export default ChartWrapper;
