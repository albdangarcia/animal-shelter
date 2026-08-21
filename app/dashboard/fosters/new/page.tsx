import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import { fetchSpecies } from "@/app/lib/data/public.data";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { DirectAddFosterForm } from "@/components/dashboard/fosters/new/direct-add-foster-form";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { personId, returnTo } = await searchParams;

  const [species, suggestedPerson, canCreatePerson] = await Promise.all([
    fetchSpecies(),
    // Prefill from the Fostering tab's "Add as Foster" shortcut.
    personId ? fetchPersonForApplicationForm(personId) : Promise.resolve(null),
    hasPermission(AppPermissions.PERSONS_MANAGE),
  ]);

  return (
    <main>
      <DirectAddFosterForm
        species={species}
        suggestedPersonId={suggestedPerson?.id}
        suggestedPersonLabel={suggestedPerson?.name}
        returnTo={returnTo}
        canCreatePerson={canCreatePerson}
      />
    </main>
  );
};

export default Page;
