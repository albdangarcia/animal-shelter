import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchAdoptionApplicationForEdit } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationEditForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-edit-form";
import { SearchParamsType } from "@/app/lib/types";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: Promise<{ applicationId: string }>;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { applicationId } = await params;
  const { returnTo } = await searchParams;

  const [application, help] = await Promise.all([
    fetchAdoptionApplicationForEdit(applicationId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.applicationEdit),
  ]);

  if (!application) {
    notFound();
  }

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <StaffAdoptionApplicationEditForm
        application={application}
        personId={application.applicantId}
        returnTo={returnTo}
      />
    </main>
  );
};

export default Page;
