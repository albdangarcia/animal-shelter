import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalBatchOptions } from "@/app/lib/data/medical-batch.data";
import { MedicalBatch } from "@/components/dashboard/medical/medical-batch";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

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
  const [options, help] = await Promise.all([
    fetchMedicalBatchOptions(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.medicalBatch),
  ]);
  return <MedicalBatch options={options} help={help} />;
};

export default Page;
