import { fetchAnimalAssessments } from "@/app/lib/data/animals/animal-assessment.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import AnimalAssessmentsTab from "@/components/dashboard/animals/assessments/assessments";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ASSESSMENT_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;
  const { page = "1", type, outcome, sort, status } = await searchParams;
  const currentPage = Number(page);
  const canManage = await hasPermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE);

  const { assessments, totalPages } = await fetchAnimalAssessments(
    animalId,
    currentPage,
    type,
    outcome,
    sort,
    status,
  );

  return (
    <AnimalAssessmentsTab
      animalAssessments={assessments}
      totalPages={totalPages}
      animalId={animalId}
      canManage={canManage}
    />
  );
};

export default Page;