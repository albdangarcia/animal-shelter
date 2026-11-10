import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchDoseSheet } from "@/app/lib/data/medication-doses.data";
import { DoseSheet } from "@/components/dashboard/medical/dose-sheet";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  // A param given more than once arrives as a list.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.MEDICAL_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { day } = await searchParams;
  const [page, canAdminister, help] = await Promise.all([
    fetchDoseSheet(day),
    hasPermission(AppPermissions.MEDICAL_ADMINISTER),
    getHelpLinkGuide(PAGE_HELP_GUIDES.medicalDoses),
  ]);

  return <DoseSheet page={page} canAdminister={canAdminister} help={help} />;
};

export default Page;
