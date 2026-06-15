import { IDParamType } from "@/app/lib/types";
import { AnimalNavTabs } from "@/components/dashboard/animals/tabs-nav/animal-nav-tabs";
import { Suspense } from "react";
import AnimalSectionCardsSkeleton from "@/components/skeletons/animalSectionCardsSkeleton";
import AnimalSectionCards from "@/components/dashboard/animals/animal-section-cards";

interface Props {
  children: React.ReactNode;
  params: IDParamType;
}

const Layout = ({ children, params }: Props) => {
  return (
    <>
      <Suspense fallback={<AnimalSectionCardsSkeleton />}>
        <AnimalSectionCards params={params} />
      </Suspense>

      <AnimalNavTabs />
      
      {children}
    </>
  );
};

export default Layout;
