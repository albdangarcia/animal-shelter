import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import PersonActivityFeed from "@/components/dashboard/people-directory/activity/person-activity-feed";
import { fetchPersonActivity } from "@/app/lib/data/people-directory/person-activity.data";
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

  const [{ activity }, help] = await Promise.all([
    fetchPersonActivity(personId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.personActivity),
  ]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PersonActivityFeed activity={activity} />
    </div>
  );
};

export default Page;
