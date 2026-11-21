import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchShelterBoard } from "@/app/lib/data/locations/shelter-board.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
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
  const [data, canReadFosters, help] = await Promise.all([
    fetchShelterBoard(),
    hasPermission(AppPermissions.FOSTERS_READ),
    getHelpLinkGuide(PAGE_HELP_GUIDES.housingBoard),
  ]);

  return <ShelterBoard data={data} canReadFosters={canReadFosters} help={help} />;
};

export default Page;
