import MedicalCatalog from "@/components/dashboard/settings/medical/medical-catalog";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  fetchMedicalCatalog,
  fetchMedicalCatalogSpecies,
} from "@/app/lib/data/medical-catalog.data";

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
  const [items, species] = await Promise.all([
    fetchMedicalCatalog(),
    fetchMedicalCatalogSpecies(),
  ]);

  return <MedicalCatalog items={items} species={species} />;
};

export default Page;
