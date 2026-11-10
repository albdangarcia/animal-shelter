import MedicalProtocols from "@/components/dashboard/settings/medical/medical-protocols";
import { MedicalSettingsNav } from "@/components/dashboard/settings/medical/medical-settings-nav";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalProtocols } from "@/app/lib/data/medical-protocol.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MEDICAL_SETTINGS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [{ protocols, species, items }, help] = await Promise.all([
    fetchMedicalProtocols(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsMedicalProtocols),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MedicalSettingsNav />
      <MedicalProtocols protocols={protocols} species={species} items={items} help={help} />
    </div>
  );
};

export default Page;
