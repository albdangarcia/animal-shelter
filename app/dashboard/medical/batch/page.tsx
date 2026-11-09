import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalBatchOptions } from "@/app/lib/data/medical-batch.data";
import { MedicalBatch } from "@/components/dashboard/medical/medical-batch";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MEDICAL_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const options = await fetchMedicalBatchOptions();
  return <MedicalBatch options={options} />;
};

export default Page;
