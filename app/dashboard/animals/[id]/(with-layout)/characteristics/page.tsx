import { fetchAnimalCharacteristics } from "@/app/lib/data/animals/animal-characteristics.data";
import { IDParamType } from "@/app/lib/types";
import AnimalCharacteristicsManager from "@/components/dashboard/animals/characteristics/characteristics";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_CHARACTERISTICS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const [canManage, animalCharacteristics] = await Promise.all([
    hasPermission(AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE),
    fetchAnimalCharacteristics(animalId),
  ]);

  return (
    <AnimalCharacteristicsManager
      animalCharacteristics={animalCharacteristics}
      animalId={animalId}
      canManage={canManage}
    />
  );
};

export default Page;
