import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { fetchAssessmentDetail } from "@/app/lib/data/animals/animal-assessment.data";
import { AssessmentSuggestions } from "@/components/dashboard/animals/assessments/assessment-suggestions";
import { AssessmentDetailActions } from "@/components/dashboard/animals/assessments/assessment-actions";
import { SignalBadge } from "@/components/dashboard/animals/assessments/signal-badge";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";

interface Props {
  params: Promise<{ id: string; assessmentId: string }>;
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

  const [assessment, canManage, canManageCharacteristics] = await Promise.all([
    fetchAssessmentDetail(animalId, assessmentId),
    hasPermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE),
    hasPermission(AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE),
  ]);
  if (!assessment) notFound();

  const isDeleted = assessment.deletedAt !== null;
  const hasSuggestions =
    assessment.suggestions.length > 0 || assessment.superseded.length > 0;

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animalId}/assessments`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Link>
      </Button>

      <div className="mx-auto w-full max-w-3xl space-y-6">
        {isDeleted && (
          <Alert variant="destructive">
            <Trash2 className="h-4 w-4" />
            <AlertTitle>
              Deleted on {formatDateToLongString(assessment.deletedAt!)}
            </AlertTitle>
            <AlertDescription>
              This assessment no longer counts toward the animal&apos;s record.
              Characteristics it sourced still cite it until each is re-sourced
              or removed on the Characteristics tab.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl">{assessment.template.name}</h1>
              <SignalBadge signal={assessment.signal} />
            </CardTitle>
            <CardDescription>
              {assessment.animal.name} · observed{" "}
              {formatDateToLongString(assessment.observedAt)} by{" "}
              {assessment.assessor.name} · template version{" "}
              {assessment.template.version}
            </CardDescription>
            <CardAction>
              <AssessmentDetailActions
                assessmentId={assessment.id}
                animalId={animalId}
                isDeleted={isDeleted}
                canManage={canManage}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
            {assessment.summary && (
              <section aria-labelledby="assessment-summary">
                <h2 id="assessment-summary" className="font-semibold">
                  Summary
                </h2>
                <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                  {assessment.summary}
                </p>
              </section>
            )}

            <section aria-labelledby="assessment-findings">
              <h2 id="assessment-findings" className="font-semibold">
                Findings
              </h2>
              {assessment.answers.length > 0 ? (
                <ul className="mt-2 divide-y">
                  {assessment.answers.map((answer) => (
                    <li
                      key={answer.id}
                      className="grid grid-cols-1 gap-1 py-2 text-sm sm:grid-cols-3 sm:gap-4"
                    >
                      <span className="text-muted-foreground">
                        {answer.questionLabel}
                      </span>
                      <div className="sm:col-span-2">
                        <p className="font-medium text-foreground">
                          {answer.value || "—"}
                        </p>
                        {answer.notes && (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            Note: {answer.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No individual answers were recorded.
                </p>
              )}
            </section>
          </CardContent>
        </Card>

        {hasSuggestions && (
          <Card>
            <CardHeader>
              <CardTitle>Characteristics these findings suggest</CardTitle>
              <CardDescription>
                Adding or citing writes a link back to this assessment. A
                contradicting finding is shown as a warning, not a block.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssessmentSuggestions
                animalId={animalId}
                assessmentId={assessment.id}
                suggestions={assessment.suggestions}
                superseded={assessment.superseded}
                canManage={canManageCharacteristics}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default Page;
