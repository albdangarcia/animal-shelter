import DoseTimes from "@/components/dashboard/settings/medical/dose-times";
import { MedicalSettingsNav } from "@/components/dashboard/settings/medical/medical-settings-nav";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
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
  const [{ doseSlotEnds }, help] = await Promise.all([
    getShelterSettings(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsMedicalDoseTimes),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MedicalSettingsNav />
      <DoseTimes ends={doseSlotEnds} help={help} />
    </div>
  );
};

export default Page;
