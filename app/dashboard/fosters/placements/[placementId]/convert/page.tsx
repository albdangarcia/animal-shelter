import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { FosterPlacementType } from "@prisma/client";
import { fetchFosterPlacementById } from "@/app/lib/data/fosters/fosters.data";
import { ConvertFosterToAdoptionForm } from "@/components/dashboard/fosters/placements/convert-foster-to-adoption-form";

interface Props {
  params: Promise<{ placementId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { placementId } = await params;

  const placement = await fetchFosterPlacementById(placementId);
  if (!placement) {
    return notFound();
  }

  if (placement.endDate !== null) {
    return (
      <main className="container mx-auto">
        <ActionBlockedMessage icon={Ban} title="Placement Already Ended">
          <p>
            This foster placement for <strong>{placement.animal.name}</strong>{" "}
            has already ended.
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  if (placement.type !== FosterPlacementType.FOSTER_TO_ADOPT) {
    return (
      <main className="container mx-auto">
        <ActionBlockedMessage icon={Ban} title="Not a Foster-to-Adopt Placement">
          <p>
            Only foster-to-adopt placements can be converted here. Process an
            adoption for <strong>{placement.animal.name}</strong> through the
            standard outcome flow instead.
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  return (
    <main className="container mx-auto">
      <ConvertFosterToAdoptionForm
        placement={{
          id: placement.id,
          animal: placement.animal,
          fosterProfile: { person: { name: placement.fosterProfile.person.name } },
        }}
      />
    </main>
  );
};

export default Page;
