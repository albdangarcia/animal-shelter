import { notFound } from "next/navigation";
import { Ban, HelpCircle } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import { FosterStatus } from "@/prisma/generated/enums";
import {
  fetchAnimalForFosterPlacement,
  fetchAnimalsEligibleForFosterPlacement,
  fetchFosterProfileForPlacement,
  fetchFostersForPicker,
} from "@/app/lib/data/fosters/fosters.data";
import { PlacementCreateForm } from "@/components/dashboard/fosters/placements/placement-create-form";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { animalId, fosterProfileId } = (await searchParams) || {};

  if ((animalId && fosterProfileId) || (!animalId && !fosterProfileId)) {
    return notFound();
  }

  if (animalId) {
    const animal = await fetchAnimalForFosterPlacement(animalId);
    if (!animal) {
      return notFound();
    }

    if (animal.hasOpenPlacement) {
      return (
        <main className="container mx-auto">
          <ActionBlockedMessage icon={Ban} title="Already In Foster">
            <p>
              <strong>{animal.name}</strong> already has an open foster
              placement. Return the animal from its current foster before
              placing it again.
            </p>
          </ActionBlockedMessage>
        </main>
      );
    }

    if (!animal.isInCare) {
      return (
        <main className="container mx-auto">
          <ActionBlockedMessage icon={HelpCircle} title="Not In Care">
            <p>
              <strong>{animal.name}</strong> is not currently in the
              shelter&apos;s care, so it can&apos;t be placed with a foster.
            </p>
          </ActionBlockedMessage>
        </main>
      );
    }

    const fosterOptions = await fetchFostersForPicker();

    return (
      <main className="container mx-auto">
        <PlacementCreateForm
          fixedAnimal={{ id: animal.id, name: animal.name }}
          fosterOptions={fosterOptions}
        />
      </main>
    );
  }

  const fosterProfile = await fetchFosterProfileForPlacement(
    fosterProfileId as string,
  );
  if (!fosterProfile) {
    return notFound();
  }

  if (fosterProfile.status !== FosterStatus.ACTIVE) {
    return (
      <main className="container mx-auto">
        <ActionBlockedMessage icon={Ban} title="Foster Not Active">
          <p>
            <strong>{fosterProfile.personName}</strong>&apos;s foster profile
            status is{" "}
            <strong>{fosterProfile.status.toLowerCase()}</strong>, so a new
            placement can&apos;t be created for them.
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  if (fosterProfile.openPlacementsCount >= fosterProfile.maxAnimals) {
    return (
      <main className="container mx-auto">
        <ActionBlockedMessage icon={Ban} title="At Capacity">
          <p>
            <strong>{fosterProfile.personName}</strong> is already fostering{" "}
            {fosterProfile.openPlacementsCount}/{fosterProfile.maxAnimals}{" "}
            animals.
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  const animalOptions = await fetchAnimalsEligibleForFosterPlacement();

  return (
    <main className="container mx-auto">
      <PlacementCreateForm
        fixedFoster={{ id: fosterProfile.id, personName: fosterProfile.personName }}
        animalOptions={animalOptions}
      />
    </main>
  );
};

export default Page;
