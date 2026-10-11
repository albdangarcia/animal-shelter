import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalManage } from "@/app/lib/data/medical-catalog.data";
import { fetchVaccinesAndTests } from "@/app/lib/data/animals/medical-entry.data";
import VaccinesAndTests from "@/components/dashboard/animals/medical/vaccines-and-tests";

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
  const [{ entries, names }, manage] = await Promise.all([
    fetchVaccinesAndTests(animalId),
    fetchMedicalManage(animalId),
  ]);

  return <VaccinesAndTests entries={entries} names={names} manage={manage} />;
};

export default Page;
