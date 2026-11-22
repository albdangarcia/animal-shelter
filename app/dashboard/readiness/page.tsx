import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { SearchParamsType } from "@/app/lib/types";
import { fetchReadinessForAnimals } from "@/app/lib/data/animals/readiness.data";
import {
  buildReadinessBoard,
  parseReadinessBoardFilters,
  parseReadinessPage,
  readinessBoardFilterOptions,
} from "@/app/lib/readiness/board";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { READINESS_READ_PERMISSIONS } from "@/app/lib/readiness/permissions";
import { ReadinessBoard } from "@/components/dashboard/readiness/readiness-board";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permissions={READINESS_READ_PERMISSIONS}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { species, location, stage, kind, page = "1" } = await searchParams;

  const [
    readiness,
    manageAssessments,
    manageAnimalInfo,
    managePhotos,
    manageMedical,
    help,
  ] = await Promise.all([
    fetchReadinessForAnimals(),
    hasPermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE),
    hasPermission(AppPermissions.ANIMAL_INFO_MANAGE),
    hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE),
    hasPermission(AppPermissions.MEDICAL_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.readinessBoard),
  ]);

  const board = buildReadinessBoard(
    readiness,
    parseReadinessBoardFilters({ species, location, stage, kind }),
    new Date(),
    parseReadinessPage(page),
    (await getShelterSettings()).timezone,
  );

  return (
    <ReadinessBoard
      board={board}
      filterOptions={readinessBoardFilterOptions(
        readiness.map((r) => r.animal),
      )}
      can={{ manageAssessments, manageAnimalInfo, managePhotos, manageMedical }}
      filterParams={{ species, location, stage }}
      help={help}
    />
  );
};

export default Page;
