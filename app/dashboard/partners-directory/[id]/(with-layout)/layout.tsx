import { IDParamType } from "@/app/lib/types";
import { PartnerNavTabs } from "@/components/dashboard/partners-directory/tabs-nav/partner-nav-tabs";
import { Suspense } from "react";
import PartnerSectionCards from "@/components/dashboard/partners-directory/partner-section-cards";
import PartnerSectionCardsSkeleton from "@/components/skeletons/partnerSectionCardsSkeleton";

interface Props {
  children: React.ReactNode;
  params: IDParamType;
}

const Layout = ({ children, params }: Props) => {
  return (
    <>
      <Suspense fallback={<PartnerSectionCardsSkeleton />}>
        <PartnerSectionCards params={params} />
      </Suspense>

      <PartnerNavTabs />

      {children}
    </>
  );
};

export default Layout;