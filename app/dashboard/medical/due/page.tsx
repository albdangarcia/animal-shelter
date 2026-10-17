import { fetchWaitingVetVisitReports } from "@/app/lib/data/vet-visit-reports.data";
import { WaitingVetReports } from "@/components/dashboard/medical/waiting-vet-reports";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchMedicalDue } from "@/app/lib/data/medical-due.data";
import { MedicalDue } from "@/components/dashboard/medical/medical-due";

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
  const { kind } = await searchParams;
  const [{ groups, today, kinds }, canManage, canAdminister, reports] = await Promise.all([
    fetchMedicalDue(kind),
    hasPermission(AppPermissions.MEDICAL_MANAGE),
    hasPermission(AppPermissions.MEDICAL_ADMINISTER),
    fetchWaitingVetVisitReports(),
  ]);

  return (
    <div className="space-y-6">
      <MedicalDue
        groups={groups}
        today={today}
        filtered={kinds.length > 0}
        canManage={canManage}
        canAdminister={canAdminister}
      />
      <WaitingVetReports groups={reports} />
    </div>
  );
};

export default Page;
