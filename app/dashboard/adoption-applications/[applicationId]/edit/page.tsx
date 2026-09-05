import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchAdoptionApplicationForEdit } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationEditForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-edit-form";
import { SearchParamsType } from "@/app/lib/types";

interface Props {
  params: Promise<{ applicationId: string }>;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { applicationId } = await params;
  const { returnTo } = await searchParams;

  const application = await fetchAdoptionApplicationForEdit(applicationId);

  if (!application) {
    notFound();
  }

  return (
    <main>
      <StaffAdoptionApplicationEditForm
        application={application}
        personId={application.applicantId}
        returnTo={returnTo}
      />
    </main>
  );
};

export default Page;
