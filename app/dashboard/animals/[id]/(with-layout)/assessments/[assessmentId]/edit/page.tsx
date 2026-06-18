import { Suspense } from "react";
import { fetchAnimalAssessmentById, fetchAssessmentTemplates } from "@/app/lib/data/animals/animal-assessment.data";
import { AssessmentForm } from "@/components/dashboard/animals/assessments/assessment-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { notFound } from "next/navigation";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

interface Props {
  params: Promise<{ id: string, assessmentId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ASSESSMENT_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId, assessmentId } = await params;

  const [templates, assessment] = await Promise.all([
    fetchAssessmentTemplates(),
    fetchAnimalAssessmentById(assessmentId),
  ]);
  
  if (!assessment) {
    notFound();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Assessment</CardTitle>
        <CardDescription>
          Edit the details for this assessment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div>Loading assessment form...</div>}>
          <AssessmentForm assessment={assessment} animalId={animalId} templates={templates} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

export default Page;
