import { FosterStatus } from "@prisma/client";
import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchFosterProfileByPersonId } from "@/app/lib/data/fosters/fosters.data";
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { FosterProfileEmptyState } from "@/components/dashboard/fosters/profile/foster-profile-empty-state";
import { FosterProfileStatusCard } from "@/components/dashboard/fosters/profile/foster-profile-status-card";
import { FosterCurrentPlacementsCard } from "@/components/dashboard/fosters/profile/foster-current-placements-card";
import { FosterPlacementHistoryCard } from "@/components/dashboard/fosters/profile/foster-placement-history-card";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: personId } = await params;

  const [profile, canManage] = await Promise.all([
    fetchFosterProfileByPersonId(personId),
    hasPermission(AppPermissions.FOSTERS_MANAGE),
  ]);

  if (!profile) {
    return <FosterProfileEmptyState personId={personId} canManage={canManage} />;
  }

  // Only needed for the capability edit form, which is manage-gated.
  const species = canManage ? await fetchSpecies() : [];

  const openPlacementsCount = profile.placements.filter(
    (p) => p.endDate === null,
  ).length;
  const canPlaceMore =
    profile.status === FosterStatus.ACTIVE &&
    openPlacementsCount < profile.maxAnimals;

  return (
    <div className="space-y-6">
      <FosterProfileStatusCard
        profile={profile}
        canManage={canManage}
        species={species}
        hasOpenPlacement={openPlacementsCount > 0}
      />
      <FosterCurrentPlacementsCard
        fosterProfileId={profile.id}
        placements={profile.placements}
        canManage={canManage}
        canPlaceMore={canPlaceMore}
      />
      <FosterPlacementHistoryCard placements={profile.placements} />
    </div>
  );
};

export default Page;
