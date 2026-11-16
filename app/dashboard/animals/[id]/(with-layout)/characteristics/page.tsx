import { fetchAnimalCharacteristics } from "@/app/lib/data/animals/animal-characteristics.data";
import { IDParamType } from "@/app/lib/types";
import AnimalCharacteristicsManager from "@/components/dashboard/animals/characteristics/characteristics";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_CHARACTERISTICS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const [canManage, animalCharacteristics, help] = await Promise.all([
    hasPermission(AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE),
    fetchAnimalCharacteristics(animalId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.animalCharacteristics),
  ]);

  return (
    <AnimalCharacteristicsManager
      animalCharacteristics={animalCharacteristics}
      animalId={animalId}
      canManage={canManage}
      help={help}
    />
  );
};

export default Page;
