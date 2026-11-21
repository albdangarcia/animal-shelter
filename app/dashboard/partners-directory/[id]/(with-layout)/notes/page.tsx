import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchPartnerNotes } from "@/app/lib/data/partners-directory/partner-notes.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import PartnerNotes from "@/components/dashboard/partners-directory/notes/partner-notes";
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
      permission={AppPermissions.PARTNERS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: partnerId } = await params;
  const { page = "1", sort, status } = await searchParams;
  const currentPage = Number(page);

  const [{ notes, totalPages, totalRows }, canManage, help] =
    await Promise.all([
      fetchPartnerNotes(partnerId, currentPage, sort, status),
      hasPermission(AppPermissions.PARTNERS_MANAGE),
      getHelpLinkGuide(PAGE_HELP_GUIDES.partnerNotes),
    ]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PartnerNotes
        notes={notes}
        totalPages={totalPages}
        totalRows={totalRows}
        partnerId={partnerId}
        canManage={canManage}
      />
    </div>
  );
};

export default Page;