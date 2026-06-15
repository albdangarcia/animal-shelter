import PersonForm from "@/components/dashboard/people-directory/person-form";
import { Permissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { fetchMyHouseholdProfile, fetchMyProfile } from "@/app/lib/data/people-directory/people-directory.data";
import { notFound } from "next/navigation";
import { SearchParamsType } from "@/app/lib/types";
import HouseholdProfileForm from "@/components/dashboard/account/household-profile-form";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={Permissions.MY_PROFILE_UPDATE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { returnTo } = await searchParams;
  const resolvedReturnTo = typeof returnTo === "string" ? returnTo : undefined;

  const person = await fetchMyProfile();

  if (!person) {
    notFound();
  }

  const householdProfile = await fetchMyHouseholdProfile();

  return (
    <main className="space-y-8">
      <PersonForm
        person={person}
        mode="self"
        cancelHref="/dashboard"
        returnTo={resolvedReturnTo}
      />
      <HouseholdProfileForm
        householdProfile={householdProfile}
        returnTo={resolvedReturnTo}
      />
    </main>
  );
};

export default Page;