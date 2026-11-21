import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import PersonAnimalHistory from "@/components/dashboard/people-directory/history/person-animal-history";
import { fetchPersonAnimalHistory } from "@/app/lib/data/people-directory/person-animal-history.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: personId } = await params;

  const [{ history }, help] = await Promise.all([
    fetchPersonAnimalHistory(personId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.personHistory),
  ]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PersonAnimalHistory history={history} />
    </div>
  );
};

export default Page;
