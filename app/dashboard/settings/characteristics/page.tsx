import CharacteristicsCatalog from "@/components/dashboard/settings/characteristics/characteristics-catalog";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchCharacteristicsCatalog } from "@/app/lib/data/animals/characteristics-catalog.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_CHARACTERISTICS_CATALOG}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [characteristics, help] = await Promise.all([
    fetchCharacteristicsCatalog(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsCharacteristics),
  ]);

  return <CharacteristicsCatalog characteristics={characteristics} help={help} />;
};

export default Page;