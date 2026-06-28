import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { searchPublishedAnimals } from "@/app/lib/data/animals/animal.data";
import { notFound } from "next/navigation";
import StaffAdoptionApplicationForm from "@/components/dashboard/people-directory/adoption-applications/staff-adoption-application-form";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: personId } = await params;
  const { animalSearch } = await searchParams;

  const query = typeof animalSearch === "string" ? animalSearch.trim() : "";

  const [person, animalResults] = await Promise.all([
    fetchPersonForApplicationForm(personId),
    query.length >= 2
      ? searchPublishedAnimals(query, personId)
      : Promise.resolve([]),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <StaffAdoptionApplicationForm
      person={person}
      animalResults={animalResults}
      animalSearch={query}
    />
  );
};

export default Page;
