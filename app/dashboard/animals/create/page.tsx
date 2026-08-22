import AnimalForm from "@/components/dashboard/animals/animal-intake-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchColors, fetchPartners, fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.INTAKE_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [partners, colors, speciesList, unitOptions, canCreatePerson] =
    await Promise.all([
      fetchPartners(),
      fetchColors(),
      fetchSpecies(),
      fetchUnitPickerOptions(),
      hasPermission(AppPermissions.PERSONS_MANAGE),
    ]);

  return (
    <main>
      <AnimalForm
        speciesList={speciesList}
        partners={partners}
        colors={colors}
        unitOptions={unitOptions}
        canCreatePerson={canCreatePerson}
      />
    </main>
  );
}

export default Page;
