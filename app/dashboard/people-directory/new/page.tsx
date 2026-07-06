import PersonForm from "@/components/dashboard/people-directory/person-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { SearchParamsType } from "@/app/lib/types";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  return (
    <main>
      <PersonForm returnTo={resolvedReturnTo} />
    </main>
  );
};

export default Page;