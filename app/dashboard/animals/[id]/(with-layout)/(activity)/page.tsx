import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { fetchAnimalActivityLogs } from "@/app/lib/data/animals/animal-activity.data";
import { fetchAnimalReadiness } from "@/app/lib/data/animals/readiness.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import ActivityFeed from "@/components/dashboard/animals/activity-feed/activity-feed";
import { AnimalReadinessPanel } from "@/components/dashboard/animals/readiness/animal-readiness-panel";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ACTIVITY_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;

  const { page = "1" } = await searchParams;
  const currentPage = Number(page);

  const [
    { activityLogs, totalPages },
    canReadAnimalInfo,
    canReadAssessments,
    canReadCharacteristics,
    manageAssessments,
    manageAnimalInfo,
    managePhotos,
  ] = await Promise.all([
    fetchAnimalActivityLogs(currentPage, animalId),
    hasPermission(AppPermissions.ANIMAL_INFO_READ),
    hasPermission(AppPermissions.ANIMAL_ASSESSMENT_READ),
    hasPermission(AppPermissions.ANIMAL_CHARACTERISTICS_READ),
    hasPermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE),
    hasPermission(AppPermissions.ANIMAL_INFO_MANAGE),
    hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE),
  ]);

  const canReadReadiness =
    canReadAnimalInfo && canReadAssessments && canReadCharacteristics;

  return (
    <div className="flex flex-col gap-4">
      {canReadReadiness && (
        <AnimalReadinessPanel
          animalId={animalId}
          blockers={await fetchAnimalReadiness(animalId)}
          can={{ manageAssessments, manageAnimalInfo, managePhotos }}
        />
      )}
      <ActivityFeed activityLogs={activityLogs} totalPages={totalPages} />
    </div>
  );
};

export default Page;