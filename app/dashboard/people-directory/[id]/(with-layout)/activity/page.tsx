import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { Permissions } from "@/app/lib/auth/permissions";
import PersonActivityFeed from "@/components/dashboard/people-directory/activity/person-activity-feed";
import { fetchPersonActivity } from "@/app/lib/data/people-directory/person-activity.data";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={Permissions.PERSONS_READ_DETAIL}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: personId } = await params;

  const { activity } = await fetchPersonActivity(personId);

  return <PersonActivityFeed activity={activity} />;
};

export default Page;
