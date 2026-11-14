import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { IDParamType } from "@/app/lib/types";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import {
  fetchAnimalForReIntake,
  fetchPartners,
} from "@/app/lib/data/animals/animal.data";
import ReIntakeForm from "@/components/dashboard/animals/re-intake-form";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { notFound } from "next/navigation";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchReIntakeProtocolPreview } from "@/app/lib/data/medical-protocol.data";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import {
  deathOutcomeLabel,
  DEATH_REVERSAL_HINT,
} from "@/app/lib/utils/death-outcome";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id: animalId } = await params;

  return (
    <Authorize
      permission={AppPermissions.INTAKE_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent animalId={animalId} />
    </Authorize>
  );
};

const PageContent = async ({ animalId }: { animalId: string }) => {
  const [animal, partners, canCreatePerson, canManageMedical, help] =
    await Promise.all([
      fetchAnimalForReIntake(animalId),
      fetchPartners(),
      hasPermission(AppPermissions.PERSONS_MANAGE),
      hasPermission(AppPermissions.MEDICAL_MANAGE),
      getHelpLinkGuide(PAGE_HELP_GUIDES.animalReIntake),
    ]);

  if (!animal) {
    return notFound();
  }

  // If animal is NOT archived, show the new message component
  if (animal.listingStatus !== AnimalListingStatus.ARCHIVED) {
    return (
      <main className="container mx-auto">
        <Button asChild variant="ghost" className="mb-4">
          <Link href={`/dashboard/animals/${animalId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Animal Profile
          </Link>
        </Button>

        <ActionBlockedMessage
          icon={TriangleAlert}
          title="Cannot Process Re-Intake"
        >
          <p>
            This animal, <strong>{animal.name}</strong>, cannot be processed for
            re-intake because its current status is{" "}
            <span className="font-semibold">
              {formatSingleEnumOption(animal.listingStatus)}
            </span>
            .
          </p>
          <p>
            Re-intake is only available for animals that are no longer in the
            shelter (i.e., have an <strong>ARCHIVED</strong> status).
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  // An animal that died can't come back; the service refuses it too. A death
  // recorded by mistake is reversed, which puts the animal back in care.
  if (animal.stayEndingDeath) {
    return (
      <main className="container mx-auto">
        <Button asChild variant="ghost" className="mb-4">
          <Link href={`/dashboard/animals/${animalId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Animal Profile
          </Link>
        </Button>

        <ActionBlockedMessage
          icon={TriangleAlert}
          title="Cannot Process Re-Intake"
        >
          <p>
            This animal, <strong>{animal.name}</strong>, can&apos;t be processed
            for re-intake because its outcome was{" "}
            <span className="font-semibold">
              {deathOutcomeLabel(animal.stayEndingDeath)}
            </span>
            .
          </p>
          <p>
            An animal that has died can&apos;t be taken back in.{" "}
            {DEATH_REVERSAL_HINT}
          </p>
        </ActionBlockedMessage>
      </main>
    );
  }

  // Only someone who may manage medical care sees the protocol and may leave
  // it out; anyone else's re-intake applies it as the shelter set it.
  const protocolPreview = canManageMedical
    ? await fetchReIntakeProtocolPreview(animalId)
    : null;

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animalId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Animal Profile
        </Link>
      </Button>

      <ReIntakeForm
        animal={animal}
        partners={partners}
        canCreatePerson={canCreatePerson}
        protocolPreview={protocolPreview}
        today={await getShelterToday()}
        help={help}
      />
    </main>
  );
};

export default Page;
