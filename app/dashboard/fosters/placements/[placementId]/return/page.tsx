import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchFosterPlacementById } from "@/app/lib/data/fosters/fosters.data";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";
import { ReturnFromFosterForm } from "@/components/dashboard/fosters/placements/return-from-foster-form";

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

  const unitOptions = await fetchUnitPickerOptions();

  return (
    <main className="container mx-auto">
      <ReturnFromFosterForm
        placement={{
          id: placement.id,
          animal: placement.animal,
          fosterProfile: { person: { name: placement.fosterProfile.person.name } },
          previousUnitId: placement.previousUnitId,
        }}
        unitOptions={unitOptions}
      />
    </main>
  );
};

export default Page;
