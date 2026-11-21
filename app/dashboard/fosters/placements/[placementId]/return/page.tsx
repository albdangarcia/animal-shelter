import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchFosterPlacementById } from "@/app/lib/data/fosters/fosters.data";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";
import { ReturnFromFosterForm } from "@/components/dashboard/fosters/placements/return-from-foster-form";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

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

  const [unitOptions, help] = await Promise.all([
    fetchUnitPickerOptions(),
    getHelpLinkGuide(PAGE_HELP_GUIDES.fosterReturn),
  ]);

  return (
    <main className="container mx-auto">
      <div className="mx-auto mb-2 flex w-full max-w-2xl justify-end">
        <HelpLink guide={help} />
      </div>
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
