import { IDParamType } from "@/app/lib/types";
import { Suspense } from "react";
import PersonSectionCards from "@/components/dashboard/people-directory/person-section-cards";
import { PersonNavTabs } from "@/components/dashboard/people-directory/tabs-nav/person-nav-tabs";
import PersonSectionCardsSkeleton from "@/components/dashboard/people-directory/person-section-cards-skeleton";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  children: React.ReactNode;
  params: IDParamType;
}

const Layout = async ({ children, params }: Props) => {
  const showFostering = await hasPermission(AppPermissions.FOSTERS_READ);

  return (
    <>
      <Suspense fallback={<PersonSectionCardsSkeleton />}>
        <PersonSectionCards params={params} />
      </Suspense>

      <PersonNavTabs showFostering={showFostering} />

      {children}
    </>
  );
};

export default Layout;
