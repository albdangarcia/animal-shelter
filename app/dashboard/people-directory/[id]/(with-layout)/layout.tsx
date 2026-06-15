import { IDParamType } from "@/app/lib/types";
import { Suspense } from "react";
import PersonSectionCards from "@/components/dashboard/people-directory/person-section-cards";
import { PersonNavTabs } from "@/components/dashboard/people-directory/tabs-nav/person-nav-tabs";

interface Props {
  children: React.ReactNode;
  params: IDParamType;
}

const Layout = async ({ children, params }: Props) => {

  return (
    <>
      <Suspense fallback={"loading..."}>
        <PersonSectionCards params={params} />
      </Suspense>

      <PersonNavTabs />

      {children}
    </>
  );
};

export default Layout;