import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchShelterBoard } from "@/app/lib/data/locations/shelter-board.data";
import { ShelterBoard } from "@/components/dashboard/locations/shelter-board";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_INFO_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [data, canReadFosters] = await Promise.all([
    fetchShelterBoard(),
    hasPermission(AppPermissions.FOSTERS_READ),
  ]);

  return <ShelterBoard data={data} canReadFosters={canReadFosters} />;
};

export default Page;
