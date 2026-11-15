import { Suspense } from "react";
import ChartWrapper from "@/components/dashboard/analytics/chart-wrapper";
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

const Page = async () => {
  return (
    <>
      {/* Where the animals are now, counted as the shelter board counts. */}
      <Suspense fallback={<HeadcountCardsSkeleton />}>
        <HeadcountCards />
      </Suspense>

      {/* "Glance and jump": the attention panel wide, beside a column of
          small cards (Under care, Applications waiting, then Readiness).
          Stacked on narrow screens. Each has its own Suspense, so a slow
          read holds only its own card. */}
      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3">
        <Suspense fallback={<AttentionPanelSkeleton />}>
          <AttentionPanel />
        </Suspense>
        <div className="flex flex-col gap-4">
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
      </div>

      <ChartWrapper />
    </>
  );
};

export default Page;
