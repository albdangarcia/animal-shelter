import PersonForm from "@/components/dashboard/people-directory/person-form";
import { Permissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchPersonForEdit } from "@/app/lib/data/people-directory/people-directory.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { notFound } from "next/navigation";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={Permissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams}  />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  const person = await fetchPersonForEdit(id);

  if (!person) {
    notFound();
  }

  return (
    <main>
      <PersonForm person={person} returnTo={resolvedReturnTo} />
    </main>
  );
};

export default Page;