import { fetchOutcomeMedical, fetchOutcomeMedicalClinics } from "@/app/lib/data/animals/outcome-medical.data";
import { outcomeMedicalFormValues } from "@/app/lib/data/animals/outcome-medical";
import { MedicalEntryRow } from "@/components/dashboard/animals/medical/medical-entry-list";
import { findEventNames } from "@/app/lib/data/animals/medical-entry";
import prisma from "@/app/lib/prisma";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
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
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";

interface Props {
  params: Promise<{ outcomeId: string }>;
}

const EditOutcomePage = async ({ params }: Props) => {
  const { outcomeId } = await params;

  // Read access is enough to look at an outcome (the form is then read-only),
  // and the reads below throw for anyone without it, so turn them away here.
  return (
    <Authorize
      permission={AppPermissions.OUTCOMES_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent outcomeId={outcomeId} />
    </Authorize>
  );
};

const PageContent = async ({ outcomeId }: { outcomeId: string }) => {
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

  const canManageOutcome = await hasPermission(AppPermissions.OUTCOMES_MANAGE);
  const canReadMedical = await hasPermission(AppPermissions.MEDICAL_READ);
  const canManageMedical = canManageOutcome && canReadMedical && await hasPermission(AppPermissions.MEDICAL_MANAGE);
  const clinical = canReadMedical ? await fetchOutcomeMedical(outcomeId) : null;
  const clinics = canManageMedical ? await fetchOutcomeMedicalClinics() : [];
  if (clinical?.vetPartnerId && !clinics.some((clinic) => clinic.id === clinical.vetPartnerId)) clinics.push({ id: clinical.vetPartnerId, name: clinical.vetPartner?.name ?? "Historical clinic" });
  const today = await getShelterToday();
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

      {clinical && <p className="mb-2 text-sm">Linked medical record · {clinical.voidedAt ? "Voided" : "Recorded"}</p>}
      {outcome.reversedAt && !clinical && canReadMedical && (outcome.type === "DECEASED" || outcome.type === "EUTHANIZED") && <p>Medical details not recorded</p>}
      {clinical && <ul className="mb-6"><MedicalEntryRow entry={clinical} names={await findEventNames(prisma, [clinical])} today={today} unitSystem={(await getShelterSettings()).weightUnitSystem} controls={null} /></ul>}
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
          canManageOutcome={canManageOutcome}
          canManageMedical={canManageMedical}
          hasMedicalDetails={!!outcome.medicalEntry}
          medical={outcomeMedicalFormValues(clinical)}
          medicalPeople={{ authorizer: clinical?.euthanasia?.authorizedBy, performer: clinical?.euthanasia?.performedBy ?? undefined }}
          clinics={clinics}
          today={today}
        />
      )}
    </main>
  );
};

export default EditOutcomePage;
