import PartnerForm from "@/components/dashboard/partners-directory/partner-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchPartnerForEdit } from "@/app/lib/data/partners-directory/partners-directory.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { notFound } from "next/navigation";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  const partner = await fetchPartnerForEdit(id);

  if (!partner) {
    notFound();
  }

  return (
    <main>
      <PartnerForm partner={partner} returnTo={resolvedReturnTo} />
    </main>
  );
};

export default Page;