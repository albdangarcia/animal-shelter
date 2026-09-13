import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { SearchParamsType } from "@/app/lib/types";
import { fetchReadinessForAnimals } from "@/app/lib/data/animals/readiness.data";
import {
  buildReadinessBoard,
  parseReadinessBoardFilters,
  readinessBoardFilterOptions,
} from "@/app/lib/readiness/board";
import { ReadinessBoard } from "@/components/dashboard/readiness/readiness-board";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ASSESSMENT_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { species, location, stage, kind, page = "1" } = await searchParams;

  const [readiness, manageAssessments, manageAnimalInfo, managePhotos] =
    await Promise.all([
      fetchReadinessForAnimals(),
      hasPermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE),
      hasPermission(AppPermissions.ANIMAL_INFO_MANAGE),
      hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE),
    ]);

  const board = buildReadinessBoard(
    readiness,
    parseReadinessBoardFilters({ species, location, stage, kind }),
    new Date(),
    Number(page) || 1,
  );

  return (
    <ReadinessBoard
      board={board}
      filterOptions={readinessBoardFilterOptions(
        readiness.map((r) => r.animal),
      )}
      can={{ manageAssessments, manageAnimalInfo, managePhotos }}
      filterParams={{ species, location, stage }}
    />
  );
};

export default Page;
