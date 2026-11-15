import { SectionCards } from "@/components/dashboard/analytics/section-cards";
import { Suspense } from "react";
import ChartWrapper from "@/components/dashboard/analytics/chart-wrapper";
import AttentionPanel from "@/components/dashboard/home/attention-panel";
import UnderCareCard from "@/components/dashboard/home/under-care-card";
import SectionCardsSkeleton from "@/components/skeletons/sectionCards";
import AttentionPanelSkeleton from "@/components/skeletons/attentionPanelSkeleton";
import UnderCareCardSkeleton from "@/components/skeletons/underCareCardSkeleton";

const Page = async () => {
  return (
    <>
      <Suspense fallback={<SectionCardsSkeleton />}>
        <SectionCards />
      </Suspense>

      {/* "Glance and jump": the attention panel wide, beside a column of
          small cards (Under care first). Stacked on narrow screens. Each has
          its own Suspense, so a slow read holds only its own card. */}
      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3">
        <Suspense fallback={<AttentionPanelSkeleton />}>
          <AttentionPanel />
        </Suspense>
        <div className="flex flex-col gap-4">
          <Suspense fallback={<UnderCareCardSkeleton />}>
            <UnderCareCard />
          </Suspense>
        </div>
      </div>

      <ChartWrapper />
    </>
  );
};

export default Page;
