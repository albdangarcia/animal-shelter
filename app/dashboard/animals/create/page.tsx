import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import AnimalForm from "@/components/dashboard/animals/animal-intake-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { fetchColors, fetchPartners, fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchIntakeProtocols } from "@/app/lib/data/medical-protocol.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.INTAKE_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [
    partners,
    colors,
    speciesList,
    unitOptions,
    canCreatePerson,
    canManageMedical,
    help,
  ] = await Promise.all([
    fetchPartners(),
    fetchColors(),
    fetchSpecies(),
    fetchUnitPickerOptions(),
    hasPermission(AppPermissions.PERSONS_MANAGE),
    hasPermission(AppPermissions.MEDICAL_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.animalCreate),
  ]);

  // Only someone who may manage medical care sees the protocol and may leave
  // it out; anyone else's intake applies it as the shelter set it.
  const protocols = canManageMedical ? await fetchIntakeProtocols() : [];

  return (
    <main>
      <AnimalForm
        speciesList={speciesList}
        unitSystem={(await getShelterSettings()).weightUnitSystem}
        partners={partners}
        colors={colors}
        unitOptions={unitOptions}
        canCreatePerson={canCreatePerson}
        canManageMedical={canManageMedical}
        protocols={protocols}
        today={await getShelterToday()}
        help={help}
      />
    </main>
  );
}

export default Page;
