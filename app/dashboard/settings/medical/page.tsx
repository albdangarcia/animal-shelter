import MedicalCatalog from "@/components/dashboard/settings/medical/medical-catalog";
import { MedicalSettingsNav } from "@/components/dashboard/settings/medical/medical-settings-nav";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  fetchMedicalCatalog,
  fetchMedicalCatalogSpecies,
} from "@/app/lib/data/medical-catalog.data";
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
  const [items, species, help] = await Promise.all([
    fetchMedicalCatalog(),
    fetchMedicalCatalogSpecies(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsMedicalCatalog),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MedicalSettingsNav />
      <MedicalCatalog items={items} species={species} help={help} />
    </div>
  );
};

export default Page;
