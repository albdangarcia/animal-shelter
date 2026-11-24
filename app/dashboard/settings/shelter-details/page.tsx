import ShelterDetails from "@/components/dashboard/settings/shelter-details/shelter-details";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.SHELTER_DETAILS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [{ state }, help] = await Promise.all([
    getShelterSettings(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsShelterDetails),
  ]);

  return <ShelterDetails state={state} help={help} />;
};

export default Page;
