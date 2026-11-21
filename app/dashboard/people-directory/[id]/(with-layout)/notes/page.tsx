import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchPersonNotes } from "@/app/lib/data/people-directory/person-notes.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import PersonNotes from "@/components/dashboard/people-directory/notes/person-notes";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: personId } = await params;
  const { page = "1", sort, status } = await searchParams;
  const currentPage = Number(page);

  const [{ notes, totalPages }, canManage, help] = await Promise.all([
    fetchPersonNotes(personId, currentPage, sort, status),
    hasPermission(AppPermissions.PERSONS_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.personNotes),
  ]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PersonNotes
        notes={notes}
        totalPages={totalPages}
        personId={personId}
        canManage={canManage}
      />
    </div>
  );
};

export default Page;
