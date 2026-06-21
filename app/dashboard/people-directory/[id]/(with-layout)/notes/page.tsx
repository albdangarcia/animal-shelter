import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchPersonNotes } from "@/app/lib/data/people-directory/person-notes.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import PersonNotes from "@/components/dashboard/people-directory/notes/person-notes";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: personId } = await params;
  const { page = "1", sort, status } = await searchParams;
  const currentPage = Number(page);

  const { notes, totalPages } = await fetchPersonNotes(
    personId,
    currentPage,
    sort,
    status,
  );

  const canManage = await hasPermission(AppPermissions.PERSONS_MANAGE);

  return (
    <PersonNotes
      notes={notes}
      totalPages={totalPages}
      personId={personId}
      canManage={canManage}
    />
  );
};

export default Page;
