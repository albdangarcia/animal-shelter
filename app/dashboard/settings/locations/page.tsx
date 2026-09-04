import { LocationsSection } from "@/components/dashboard/settings/locations/locations-section";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchLocationsWithUnits } from "@/app/lib/data/locations/locations.data";
import type { SearchParamsType } from "@/app/lib/types";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_LOCATIONS}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { status } = await searchParams;
  const locations = await fetchLocationsWithUnits(status);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <LocationsSection locations={locations} />
    </div>
  );
};

export default Page;
