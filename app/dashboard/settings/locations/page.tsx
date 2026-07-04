import { LocationsSection } from "@/components/dashboard/settings/locations/locations-section";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchLocationsWithUnits } from "@/app/lib/data/locations/locations.data";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_LOCATIONS}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const locations = await fetchLocationsWithUnits();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <LocationsSection locations={locations} />
    </div>
  );
};

export default Page;
