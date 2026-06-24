import CharacteristicsCatalog from "@/components/dashboard/settings/characteristics/characteristics-catalog";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchCharacteristicsCatalog } from "@/app/lib/data/animals/characteristics-catalog.data";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_CHARACTERISTICS_CATALOG}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const characteristics = await fetchCharacteristicsCatalog();

  return <CharacteristicsCatalog characteristics={characteristics} />;
};

export default Page;