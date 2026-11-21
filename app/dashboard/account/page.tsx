import PersonForm from "@/components/dashboard/people-directory/person-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { fetchMyHouseholdProfile, fetchMyProfile } from "@/app/lib/data/people-directory/people-directory.data";
import { notFound } from "next/navigation";
import { SearchParamsType } from "@/app/lib/types";
import { SelfHouseholdForm } from "@/components/dashboard/household/self-household-form";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.MY_PROFILE_UPDATE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  const [person, householdProfile, help] = await Promise.all([
    fetchMyProfile(),
    fetchMyHouseholdProfile(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.myProfile),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <main className="space-y-8">
      <div className="mx-auto flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <PersonForm
        person={person}
        mode="self"
        cancelHref="/dashboard"
        returnTo={resolvedReturnTo}
      />
      <SelfHouseholdForm
        householdProfile={householdProfile}
      />
    </main>
  );
};

export default Page;