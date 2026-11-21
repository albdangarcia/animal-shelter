import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { fetchPersonProfileTabData } from "@/app/lib/data/people-directory/people-directory.data";
import { IDParamType } from "@/app/lib/types";
import { notFound } from "next/navigation";
import { StaffHouseholdForm } from "@/components/dashboard/household/staff-household-form";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id } = await params;

  const [person, help] = await Promise.all([
    fetchPersonProfileTabData(id),
    getHelpLinkGuide(PAGE_HELP_GUIDES.personHousehold),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <StaffHouseholdForm
        householdProfile={person.householdProfile}
        personId={person.id}
      />
    </main>
  );
};

export default Page;
