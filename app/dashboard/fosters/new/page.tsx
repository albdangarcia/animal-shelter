import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import { fetchSpecies } from "@/app/lib/data/public.data";
import { fetchPersonForApplicationForm } from "@/app/lib/data/people-directory/people-directory.data";
import { DirectAddFosterForm } from "@/components/dashboard/fosters/new/direct-add-foster-form";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { personId, returnTo: returnToParam } = await searchParams;
  // A repeated ?returnTo= arrives as an array.
  const returnTo =
    typeof returnToParam === "string" ? returnToParam : undefined;

  const [species, suggestedPerson, canCreatePerson, help] = await Promise.all([
    fetchSpecies(),
    // Prefill from the Fostering tab's "Add as Foster" shortcut.
    typeof personId === "string"
      ? fetchPersonForApplicationForm(personId)
      : Promise.resolve(null),
    hasPermission(AppPermissions.PERSONS_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.fosterNew),
  ]);

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
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
