import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalControls } from "@/app/lib/data/medical-catalog.data";
import { fetchMedicationsPage } from "@/app/lib/data/animals/medication.data";
import MedicationOrders from "@/components/dashboard/animals/medical/medication-orders";

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
  const [page, controls] = await Promise.all([
    fetchMedicationsPage(animalId),
    fetchMedicalControls(animalId),
  ]);

  return <MedicationOrders page={page} controls={controls} />;
};

export default Page;
