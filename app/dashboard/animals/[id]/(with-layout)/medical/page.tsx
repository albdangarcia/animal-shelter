import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalControls } from "@/app/lib/data/medical-catalog.data";
import { fetchMedicalOverview } from "@/app/lib/data/animals/medical-entry.data";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import MedicalOverview from "@/components/dashboard/animals/medical/medical-overview";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.MEDICAL_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const [overview, settings, controls] = await Promise.all([
    fetchMedicalOverview(animalId),
    getShelterSettings(),
    fetchMedicalControls(animalId),
  ]);

  return (
    <MedicalOverview
      animalId={animalId}
      overview={overview}
      unitSystem={settings.weightUnitSystem}
      controls={controls}
    />
  );
};

export default Page;
