import PersonForm from "@/components/dashboard/people-directory/person-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { SearchParamsType } from "@/app/lib/types";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;
  const help = await getHelpLinkGuide(PAGE_HELP_GUIDES.personNew);

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <PersonForm returnTo={resolvedReturnTo} />
    </main>
  );
};

export default Page;