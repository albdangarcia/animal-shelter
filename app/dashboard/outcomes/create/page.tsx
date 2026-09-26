import {
  fetchPartners,
  fetchAnimalForOutcomeForm,
} from "@/app/lib/data/animals/animal.data";
import { OutcomeForm } from "@/components/dashboard/outcomes/outcome-form";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { fetchAdoptionApplicationById } from "@/app/lib/data/user-adoption-application.data";
import { SearchParamsType } from "@/app/lib/types";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Archive, Home } from "lucide-react";
import {
  AnimalListingStatus,
  ApplicationStatus,
  FosterPlacementType,
} from "@/prisma/generated/enums";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { OutcomeFosterNotice } from "@/components/dashboard/outcomes/outcome-foster-notice";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const CreateOutcomePage = async ({ searchParams }: Props) => {
  const { animalId, applicationId } = (await searchParams) || {};

  let animal: Awaited<ReturnType<typeof fetchAnimalForOutcomeForm>> = null;
  let application = null;

  if (applicationId) {
    application = await fetchAdoptionApplicationById(applicationId);
    if (!application || !application.animal) {
      return notFound();
    }
    animal = await fetchAnimalForOutcomeForm(application.animal.id);
  } else if (animalId) {
    animal = await fetchAnimalForOutcomeForm(animalId);
  }

  if (!animal) {
    return notFound();
  }

  const [partners, canCreatePerson, canReadFosters, canManageFosters] =
    await Promise.all([
      fetchPartners(),
      hasPermission(AppPermissions.PERSONS_MANAGE),
      hasPermission(AppPermissions.FOSTERS_READ),
      hasPermission(AppPermissions.FOSTERS_MANAGE),
    ]);
  if (!partners) {
    return notFound();
  }

  const suggestedOwner = animal.intake[0]?.surrenderingPerson ?? undefined;
  const openPlacement = animal.fosterPlacements[0] ?? null;

  // The foster adopting from their own foster-to-adopt placement. The
  // conversion records that adoption and links the application to the
  // placement, which this form cannot, so the server refuses it here. Every
  // input it turns on is fixed before the form is shown (the adopter is the
  // application's applicant), so the page says so instead of offering a form
  // that can only fail. Holds the applicant's name in that case.
  //
  // Only for an approved application, as the server checks approval first:
  // the conversion offers only approved ones, so sending anything else there
  // would record the adoption with no application. An unapproved one gets the
  // form, and the server's refusal says why. `status` is the effective one.
  const adoptingFoster =
    application &&
    application.status === ApplicationStatus.APPROVED &&
    openPlacement?.type === FosterPlacementType.FOSTER_TO_ADOPT &&
    application.applicantId === openPlacement.fosterProfile.person.id
      ? application.applicantName
      : null;

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animal.id}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Animal Profile
        </Link>
      </Button>

      {animal.listingStatus === AnimalListingStatus.ARCHIVED ? (
        <ActionBlockedMessage
          icon={Archive}
          title="Outcome Already Processed"
        >
          <p>
            An outcome has already been recorded for{" "}
            <strong>{animal.name}</strong>. This animal&apos;s record is archived,
            and no further outcomes can be processed.
          </p>
        </ActionBlockedMessage>
      ) : openPlacement && adoptingFoster ? (
        <ActionBlockedMessage icon={Home} title="Convert the Foster Placement">
          <p>
            <strong>{animal.name}</strong> is in a foster-to-adopt placement
            with {adoptingFoster}, who is adopting through this application.
            Record it by converting the placement to an adoption, which links
            this application to the placement.
          </p>
          {canManageFosters ? (
            <Button asChild className="mt-2">
              <Link
                href={`/dashboard/fosters/placements/${openPlacement.id}/convert`}
              >
                Convert to Adoption
              </Link>
            </Button>
          ) : (
            <p>
              Someone who manages fosters can convert it from {animal.name}
              &apos;s page.
            </p>
          )}
        </ActionBlockedMessage>
      ) : (
        <>
          {openPlacement && (
            <OutcomeFosterNotice
              animalName={animal.name}
              placement={openPlacement}
              canReadFosters={canReadFosters}
            />
          )}
          <OutcomeForm
            animal={{ id: animal.id, name: animal.name }}
            application={application || undefined}
            partners={partners}
            suggestedOwnerId={suggestedOwner?.id}
            suggestedOwnerLabel={suggestedOwner?.name}
            canCreatePerson={canCreatePerson}
            today={await getShelterToday()}
          />
        </>
      )}
    </main>
  );
};

export default CreateOutcomePage;
