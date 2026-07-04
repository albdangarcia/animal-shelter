import { ColorsSection } from "@/components/dashboard/settings/animal-taxonomy/colors-section";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchColorsCatalog } from "@/app/lib/data/colors/colors-catalog.data";
import { fetchSpeciesCatalog } from "@/app/lib/data/species/species-catalog.data";
import { fetchBreedsCatalog } from "@/app/lib/data/breeds/breeds-catalog.data";
import { SpeciesSection } from "@/components/dashboard/settings/animal-taxonomy/species-section";
import { BreedsSection } from "@/components/dashboard/settings/animal-taxonomy/breeds-section";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_ANIMAL_TAXONOMY}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [colors, species, breeds] = await Promise.all([
    fetchColorsCatalog(),
    fetchSpeciesCatalog(),
    fetchBreedsCatalog(),
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ColorsSection colors={colors} />
      <SpeciesSection species={species} />
      <BreedsSection breeds={breeds} species={species} />
    </div>
  );
};

export default Page;