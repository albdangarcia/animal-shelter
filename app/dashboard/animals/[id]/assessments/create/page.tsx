import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchAssessmentAnimalContext } from "@/app/lib/data/animals/animal-assessment.data";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { AssessmentForm } from "@/components/dashboard/animals/assessments/assessment-form";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
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
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_ASSESSMENT_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;
  // `?template=CAT_TEST` starts the form on that template — how the readiness
  // board links a missing check straight to recording it.
  const { template } = await searchParams;
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
          <AssessmentForm
            animalId={animalId}
            templates={context.templates}
            defaultTemplateKey={template}
          />
        </CardContent>
      </Card>
    </main>
  );
};

export default Page;
