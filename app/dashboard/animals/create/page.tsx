import AnimalForm from "@/components/dashboard/animals/animal-intake-form";
import { Permissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchColors, fetchPartners, fetchSpecies } from "@/app/lib/data/animals/animal.data";

const Page = async () => {
  return (
    <Authorize
      permission={Permissions.INTAKE_CREATE}
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

  return (
    <main>
      <AnimalForm
        speciesList={speciesList}
        partners={partners}
        colors={colors}
      />
    </main>
  );
}

export default Page;