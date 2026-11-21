import { SearchParamsType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { searchPublishedAnimals } from "@/app/lib/data/animals/animal.data";
import { notFound } from "next/navigation";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";
import StaffAdoptionApplicationForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-form";

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
  const { personId, returnTo, animalSearch } = await searchParams;

  const query = typeof animalSearch === "string" ? animalSearch.trim() : "";

  const [person, animalResults, help] = await Promise.all([
    personId ? fetchPersonForApplicationForm(personId) : Promise.resolve(null),
    query.length >= 2 && personId
      ? searchPublishedAnimals(query, personId)
      : Promise.resolve([]),
    getHelpLinkGuide(PAGE_HELP_GUIDES.applicationCreate),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <StaffAdoptionApplicationForm
        person={person}
        animalResults={animalResults}
        animalSearch={query}
        returnTo={returnTo}
      />
    </main>
  );
};

export default Page;
