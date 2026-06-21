import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchPartnerNotes } from "@/app/lib/data/partners-directory/partner-notes.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import PartnerNotes from "@/components/dashboard/partners-directory/notes/partner-notes";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: partnerId } = await params;
  const { page = "1", sort, status } = await searchParams;
  const currentPage = Number(page);

  const { notes, totalPages, totalRows } = await fetchPartnerNotes(
    partnerId,
    currentPage,
    sort,
    status,
  );

  const canManage = await hasPermission(AppPermissions.PARTNERS_MANAGE);

  return (
    <PartnerNotes
      notes={notes}
      totalPages={totalPages}
      totalRows={totalRows}
      partnerId={partnerId}
      canManage={canManage}
    />
  );
};

export default Page;