import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  fetchAnimalAssessmentById,
  fetchAssessmentAnimalContext,
} from "@/app/lib/data/animals/animal-assessment.data";
import { getActiveTemplate } from "@/app/lib/assessments/templates";
import { AssessmentForm } from "@/components/dashboard/animals/assessments/assessment-form";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  params: Promise<{ id: string; assessmentId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ASSESSMENT_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId, assessmentId } = await params;

  const [context, assessment] = await Promise.all([
    fetchAssessmentAnimalContext(animalId),
    fetchAnimalAssessmentById(assessmentId),
  ]);

  if (!context || !assessment || assessment.animalId !== animalId) {
    notFound();
  }

  // Edit locks the picker to the template the assessment was recorded on, so
  // pass exactly that definition even if it's species-scoped away from the
  // animal's normal set.
  const recordedTemplate = getActiveTemplate(assessment.template.key);
  if (!recordedTemplate) notFound();

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animalId}/assessments`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Link>
      </Button>

      <Card className="mx-auto w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Edit assessment</CardTitle>
          <CardDescription>
            {assessment.template.name} for {context.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            animalId={animalId}
            templates={[recordedTemplate]}
            assessment={assessment}
          />
        </CardContent>
      </Card>
    </main>
  );
};

export default Page;
