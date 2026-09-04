import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchPersonProfileTabData } from "@/app/lib/data/people-directory/people-directory.data";
import { IDParamType } from "@/app/lib/types";
import { notFound } from "next/navigation";
import { StaffHouseholdForm } from "@/components/dashboard/household/staff-household-form";

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
  const { id } = await params;

  const person = await fetchPersonProfileTabData(id);

  if (!person) {
    notFound();
  }

  // _updateStaffHouseholdProfile refuses to write for a person with a
  // registered account — this guard keeps a direct URL hit from reaching a
  // form that can never submit successfully.
  if (person.user !== null) {
    notFound();
  }

  return (
    <main>
      <StaffHouseholdForm
        householdProfile={person.householdProfile}
        personId={person.id}
      />
    </main>
  );
};

export default Page;
