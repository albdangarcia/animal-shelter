import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonApplicationForEdit } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationEditForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-edit-form";
import { SearchParamsType } from "@/app/lib/types";

interface Props {
  params: Promise<{ id: string; applicationId: string }>;
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
  const { id: personId, applicationId } = await params;
  const { callbackUrl } = await searchParams;

  const application = await fetchPersonApplicationForEdit(applicationId, personId);

  if (!application) {
    notFound();
  }

  return (
    <StaffAdoptionApplicationEditForm
      application={application}
      personId={personId}
      callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined}
    />
  );
};

export default Page;
