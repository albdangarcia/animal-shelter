import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchAssessmentAnimalContext } from "@/app/lib/data/animals/animal-assessment.data";
import { IDParamType } from "@/app/lib/types";
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
  params: IDParamType;
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
  const { id: animalId } = await params;
  const context = await fetchAssessmentAnimalContext(animalId);
  if (!context) notFound();

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
          <CardTitle>Record an assessment</CardTitle>
          <CardDescription>
            Record a structured check for {context.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssessmentForm animalId={animalId} templates={context.templates} />
        </CardContent>
      </Card>
    </main>
  );
};

export default Page;
