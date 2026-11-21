import PartnerForm from "@/components/dashboard/partners-directory/partner-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { fetchPartnerForEdit } from "@/app/lib/data/partners-directory/partners-directory.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { notFound } from "next/navigation";
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
      permission={AppPermissions.PARTNERS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  const [partner, help] = await Promise.all([
    fetchPartnerForEdit(id),
    getHelpLinkGuide(PAGE_HELP_GUIDES.partnerEdit),
  ]);

  if (!partner) {
    notFound();
  }

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <PartnerForm partner={partner} returnTo={resolvedReturnTo} />
    </main>
  );
};

export default Page;