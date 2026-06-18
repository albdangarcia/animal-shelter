import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchAnimalActivityLogs } from "@/app/lib/data/animals/animal-activity.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import ActivityFeed from "@/components/dashboard/animals/activity-feed/activity-feed";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ACTIVITY_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;
  
  const { page = "1" } = await searchParams;
  const currentPage = Number(page);

  const { activityLogs, totalPages } = await fetchAnimalActivityLogs(
    currentPage,
    animalId
  );

  return <ActivityFeed activityLogs={activityLogs} totalPages={totalPages} />;
};

export default Page;