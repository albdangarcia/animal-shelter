import { fetchPartners } from "@/app/lib/data/animals/animal.data";
import { OutcomeForm } from "@/components/dashboard/outcomes/outcome-form";
import { fetchOutcomeById } from "@/app/lib/data/animals/outcome.data";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ outcomeId: string }>;
}

const EditOutcomePage = async ({ params }: Props) => {
  const { outcomeId } = await params;

  const [outcome, partners] = await Promise.all([
    fetchOutcomeById(outcomeId),
    fetchPartners(),
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

      <OutcomeForm
        outcome={outcome}
        animal={{ id: animal.id, name: animal.name }}
        application={application || undefined}
        partners={partners}
      />
    </main>
  );
};

export default EditOutcomePage;