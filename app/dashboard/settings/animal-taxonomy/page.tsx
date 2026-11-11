import { ColorsSection } from "@/components/dashboard/settings/animal-taxonomy/colors-section";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchColorsCatalog } from "@/app/lib/data/colors/colors-catalog.data";
import { fetchSpeciesCatalog } from "@/app/lib/data/species/species-catalog.data";
import { fetchBreedsCatalog } from "@/app/lib/data/breeds/breeds-catalog.data";
import { SpeciesSection } from "@/components/dashboard/settings/animal-taxonomy/species-section";
import { BreedsSection } from "@/components/dashboard/settings/animal-taxonomy/breeds-section";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MANAGE_ANIMAL_TAXONOMY}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [colors, species, breeds, help] = await Promise.all([
    fetchColorsCatalog(),
    fetchSpeciesCatalog(),
    fetchBreedsCatalog(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.settingsAnimalTaxonomy),
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* The page's "?" sits on its first card. */}
      <ColorsSection colors={colors} help={help} />
      <SpeciesSection species={species} />
      <BreedsSection breeds={breeds} species={species} />
    </div>
  );
};

export default Page;