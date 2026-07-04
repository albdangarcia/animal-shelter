import AnimalForm from "@/components/dashboard/animals/animal-intake-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchColors, fetchPartners, fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";

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
  const partners = await fetchPartners();
  const colors = await fetchColors();
  const speciesList = await fetchSpecies();
  const unitOptions = await fetchUnitPickerOptions();

  return (
    <main>
      <AnimalForm
        speciesList={speciesList}
        partners={partners}
        colors={colors}
        unitOptions={unitOptions}
      />
    </main>
  );
}

export default Page;