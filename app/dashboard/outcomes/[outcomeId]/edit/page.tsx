import { fetchPartners } from "@/app/lib/data/animals/animal.data";
import { OutcomeForm } from "@/components/dashboard/outcomes/outcome-form";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { fetchOutcomeById } from "@/app/lib/data/animals/outcome.data";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Undo2 } from "lucide-react";
import ActionBlockedMessage from "@/components/action-blocked-message";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  params: Promise<{ outcomeId: string }>;
}

const EditOutcomePage = async ({ params }: Props) => {
  const { outcomeId } = await params;

  const [outcome, partners, canCreatePerson] = await Promise.all([
    fetchOutcomeById(outcomeId),
    fetchPartners(),
    hasPermission(AppPermissions.PERSONS_MANAGE),
  ]);

  if (!outcome || !outcome.animal) {
    return notFound();
  }
  if (!partners) {
    return notFound();
  }

  const animal = outcome.animal;
  const application = outcome.adoptionApplication;
  
  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href="/dashboard/outcomes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Outcomes
        </Link>
      </Button>

      {/* A reversed outcome is kept as it stood when it was voided, and the
          server refuses to correct it, so there is no form to offer. */}
      {outcome.reversedAt ? (
        <ActionBlockedMessage icon={Undo2} title="Outcome Reversed">
          <p>
            This {formatSingleEnumOption(outcome.type).toLowerCase()} outcome
            for <strong>{animal.name}</strong> was reversed by{" "}
            {outcome.reversedBy?.name ?? "Unknown User"} on{" "}
            {formatDateOrNA(outcome.reversedAt)}, and can no longer be
            corrected.
          </p>
          <p>Reason: {outcome.reversalReason}</p>
        </ActionBlockedMessage>
      ) : (
        <OutcomeForm
          outcome={outcome}
          endedFosterPlacement={!!outcome.fosterPlacement}
          animal={{ id: animal.id, name: animal.name }}
          application={application || undefined}
          partners={partners}
          canCreatePerson={canCreatePerson}
          today={await getShelterToday()}
        />
      )}
    </main>
  );
};

export default EditOutcomePage;
