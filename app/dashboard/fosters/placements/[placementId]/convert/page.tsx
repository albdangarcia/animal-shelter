import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { FosterPlacementType } from "@/prisma/generated/enums";
import {
  fetchApprovedFosterApplications,
  fetchFosterPlacementById,
} from "@/app/lib/data/fosters/fosters.data";
import { ConvertFosterToAdoptionForm } from "@/components/dashboard/fosters/placements/convert-foster-to-adoption-form";

interface Props {
  params: Promise<{ placementId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
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

  const approvedApplications = await fetchApprovedFosterApplications(
    placement.fosterProfile.person.id,
    placement.animal.id,
  );

  return (
    <main className="container mx-auto">
      <ConvertFosterToAdoptionForm
        // Keyed so a client-side navigation between two placements' convert
        // pages remounts the form instead of reusing the instance — without
        // this, react-hook-form's defaultValues (which set the initial
        // application picker selection) would keep the previous placement's
        // value, since a new placementId alone does not force a React remount.
        key={placement.id}
        placement={{
          id: placement.id,
          animal: placement.animal,
          fosterProfile: { person: { name: placement.fosterProfile.person.name } },
        }}
        approvedApplications={approvedApplications}
      />
    </main>
  );
};

export default Page;
