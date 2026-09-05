import { SearchParamsType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { searchPublishedAnimals } from "@/app/lib/data/animals/animal.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-form";

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
  const { personId, returnTo, animalSearch } = await searchParams;

  const query = typeof animalSearch === "string" ? animalSearch.trim() : "";

  const [person, animalResults] = await Promise.all([
    personId ? fetchPersonForApplicationForm(personId) : Promise.resolve(null),
    query.length >= 2 && personId
      ? searchPublishedAnimals(query, personId)
      : Promise.resolve([]),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <main>
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
