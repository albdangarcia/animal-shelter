import { Suspense } from "react";
import ChartWrapper from "@/components/dashboard/analytics/chart-wrapper";
import DashboardHelpLink from "@/components/dashboard/home/dashboard-help-link";
import WelcomeCard from "@/components/dashboard/home/welcome-card";
import AttentionPanel from "@/components/dashboard/home/attention-panel";
import UnderCareCard from "@/components/dashboard/home/under-care-card";
import HeadcountCards from "@/components/dashboard/home/headcount-cards";
import HeadcountCardsSkeleton from "@/components/skeletons/headcountCardsSkeleton";
import AttentionPanelSkeleton from "@/components/skeletons/attentionPanelSkeleton";
import UnderCareCardSkeleton from "@/components/skeletons/underCareCardSkeleton";
import ApplicationsWaitingCard from "@/components/dashboard/home/applications-waiting-card";
import ApplicationsWaitingCardSkeleton from "@/components/skeletons/applicationsWaitingCardSkeleton";
import ReadinessCard from "@/components/dashboard/home/readiness-card";
import ReadinessCardSkeleton from "@/components/skeletons/readinessCardSkeleton";
import LongestStaysCard from "@/components/dashboard/home/longest-stays-card";
import LongestStaysCardSkeleton from "@/components/skeletons/longestStaysCardSkeleton";

const Page = async () => {
  return (
    <>
      {/* The heading row. The "?" waits in its own Suspense, in a box the size
          of the button, so the row keeps its height while the guide loads. It
          is empty for a viewer who can't see the guide. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Suspense fallback={<div className="size-8" aria-hidden="true" />}>
          <DashboardHelpLink />
        </Suspense>
      </div>

      {/* For a viewer without the analytics permission, in place of the cards
          below, which each render nothing for them. */}
      <WelcomeCard />

      {/* Where the animals are now, counted as the shelter board counts. */}
      <Suspense fallback={<HeadcountCardsSkeleton />}>
        <HeadcountCards />
      </Suspense>

      {/* "Glance and jump": on wide screens, the attention panel and Longest
          stays fill two columns, one under the other, beside a column of
          small cards (Under care, Applications waiting, then Readiness) that
          spans both rows. The second row is 1fr so that column's extra height
          goes there, and Longest stays starts right under the panel. In
          source order, narrow screens stack the panel, the small cards, then
          Longest stays. Each has its own Suspense, so a slow read holds only
          its own card. */}
      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:grid-rows-[auto_1fr]">
        <Suspense fallback={<AttentionPanelSkeleton />}>
          <AttentionPanel />
        </Suspense>
        <div className="flex flex-col gap-4 @4xl/main:col-start-3 @4xl/main:row-span-2 @4xl/main:row-start-1">
          <Suspense fallback={<UnderCareCardSkeleton />}>
            <UnderCareCard />
          </Suspense>
          <Suspense fallback={<ApplicationsWaitingCardSkeleton />}>
            <ApplicationsWaitingCard />
          </Suspense>
          <Suspense fallback={<ReadinessCardSkeleton />}>
            <ReadinessCard />
          </Suspense>
        </div>
        <Suspense fallback={<LongestStaysCardSkeleton />}>
          <LongestStaysCard />
        </Suspense>
      </div>

      <ChartWrapper />
    </>
  );
};

export default Page;
