import { Permissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { IDParamType } from "@/app/lib/types";
import { AnimalListingStatus } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangleIcon } from "lucide-react";
import {
  fetchAnimalForReIntake,
  fetchPartners,
} from "@/app/lib/data/animals/animal.data";
import ReIntakeForm from "@/components/dashboard/animals/re-intake-form";
import { notFound } from "next/navigation";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id: animalId } = await params;

  return (
    <Authorize
      permission={Permissions.INTAKE_CREATE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent animalId={animalId} />
    </Authorize>
  );
};

const PageContent = async ({ animalId }: { animalId: string }) => {
  const animal = await fetchAnimalForReIntake(animalId);
  const partners = await fetchPartners();

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
          icon={AlertTriangleIcon}
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

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animalId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Animal Profile
        </Link>
      </Button>

      <ReIntakeForm animal={animal} partners={partners} />
    </main>
  );
};

export default Page;
