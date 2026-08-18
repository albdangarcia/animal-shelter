import {
  fetchAnimalVitalsLogs,
  fetchAnimalCurrentWeightGrams,
} from "@/app/lib/data/animals/animal-vitals.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import AnimalVitalsTab from "@/components/dashboard/animals/vitals/vitals";
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
      permission={AppPermissions.ANIMAL_VITALS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;
  const { page = "1", sort, status } = await searchParams;
  const currentPage = Number(page);
  const canManage = await hasPermission(AppPermissions.ANIMAL_VITALS_MANAGE);

  const [{ vitalsLogs, totalPages }, previousWeightGrams] = await Promise.all([
    fetchAnimalVitalsLogs(animalId, currentPage, sort, status),
    fetchAnimalCurrentWeightGrams(animalId),
  ]);

  return (
    <AnimalVitalsTab
      vitalsLogs={vitalsLogs}
      totalPages={totalPages}
      animalId={animalId}
      canManage={canManage}
      previousWeightGrams={previousWeightGrams}
    />
  );
};

export default Page;
