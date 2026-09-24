import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchPartners } from "@/app/lib/data/animals/animal.data";
import { fetchIntakeById } from "@/app/lib/data/animals/intake.data";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { IntakeCorrectionForm } from "@/components/dashboard/intakes/intake-correction-form";
import { Button } from "@/components/ui/button";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  params: Promise<{ intakeId: string }>;
}

const EditIntakePage = async ({ params }: Props) => {
  const { intakeId } = await params;

  // The form is only any use to someone who can save it, so a reader of the
  // list is turned away here rather than at submit.
  return (
    <Authorize
      permission={AppPermissions.INTAKE_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent intakeId={intakeId} />
    </Authorize>
  );
};

const PageContent = async ({ intakeId }: { intakeId: string }) => {
  const [intake, partners, canCreatePerson, today] = await Promise.all([
    fetchIntakeById(intakeId),
    fetchPartners(),
    hasPermission(AppPermissions.PERSONS_MANAGE),
    getShelterToday(),
  ]);

  if (!intake || !partners) {
    return notFound();
  }

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href="/dashboard/intakes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Intakes
        </Link>
      </Button>

      <IntakeCorrectionForm
        intake={intake}
        partners={partners}
        canCreatePerson={canCreatePerson}
        today={today}
      />
    </main>
  );
};

export default EditIntakePage;
