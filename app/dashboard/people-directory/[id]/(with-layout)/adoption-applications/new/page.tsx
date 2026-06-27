import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-form";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: personId } = await params;

  const person = await fetchPersonForApplicationForm(personId);

  if (!person) {
    notFound();
  }

  return <StaffAdoptionApplicationForm person={person} />;
};

export default Page;
