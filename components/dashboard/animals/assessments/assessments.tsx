"use client";

import { Button } from "@/components/ui/button";
import { SimplePagination } from "@/components/simple-pagination";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnimalAssessmentListPayload } from "@/app/lib/data/animals/animal-assessment.data";
import { AssessmentOutcome } from "@prisma/client";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import {
  formatSingleEnumOption,
  assessmentOutcomeOptions,
  assessmentTypeOptions,
} from "@/app/lib/utils/enum-formatter";
import Link from "next/link";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ServerSideSwitch } from "@/components/table-common/server-side-switch";
import { AssessmentActions } from "./assessment-actions";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";

const getOutcomeBadgeVariant = (outcome: AssessmentOutcome) => {
  switch (outcome) {
    case AssessmentOutcome.EXCELLENT:
    case AssessmentOutcome.GOOD:
      return "default"; // Green in default theme
    case AssessmentOutcome.NEEDS_ATTENTION:
    case AssessmentOutcome.FAIR:
      return "secondary"; // Yellow-ish in default theme
    case AssessmentOutcome.POOR:
      return "destructive";
    default:
      return "outline";
  }
};

interface Props {
  animalAssessments: AnimalAssessmentListPayload[];
  animalId: string;
  totalPages: number;
}

const AnimalAssessmentsTab = ({
  animalAssessments,
  animalId,
  totalPages,
}: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Animal Assessments</CardTitle>
        <CardDescription>
          A log of all behavioral and medical evaluations.
        </CardDescription>
        <CardAction>
          <Button asChild>
            <Link href={`/dashboard/animals/${animalId}/assessments/create`}>
              Create Assessment
            </Link>
          </Button>
        </CardAction>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Type"
            paramKey="type"
            options={assessmentTypeOptions}
          />
          <ServerSideFacetedFilter
            title="Outcome"
            paramKey="outcome"
            options={assessmentOutcomeOptions}
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Select order"
            options={[
              { label: "Newest First", value: "date.desc" },
              { label: "Oldest First", value: "date.asc" },
            ]}
          />
          <ServerSideSwitch paramKey="showDeleted" label="Show Deleted" />
        </div>
      </CardHeader>

      <CardContent>
        {animalAssessments && animalAssessments.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {animalAssessments.map((assessment) => (
              <AccordionItem value={assessment.id} key={assessment.id}>
                <div className="flex w-full items-center justify-between">
                  <AccordionTrigger className="flex-1 text-left hover:no-underline">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-primary">
                        {assessment.template &&
                          formatSingleEnumOption(assessment.template.type)}
                      </span>
                      <span className="text-muted-foreground text-sm whitespace-nowrap">
                        on {formatDateToLongString(assessment.date)}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        by {assessment.assessor.name}
                      </span>
                      {assessment.overallOutcome && (
                        <Badge
                          variant={getOutcomeBadgeVariant(
                            assessment.overallOutcome
                          )}
                        >
                          {formatSingleEnumOption(assessment.overallOutcome)}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>

                  <div className="pl-2 mt-2 self-start">
                    <AssessmentActions
                      assessment={assessment}
                      animalId={animalId}
                    />
                  </div>
                </div>

                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {assessment.summary && (
                      <div>
                        <h4 className="font-semibold">Overall Summary</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {assessment.summary}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div>
                      <h4 className="font-semibold">Detailed Findings</h4>
                      <ul className="mt-2 space-y-2">
                        {assessment.fields.map((field) => (
                          <li
                            key={field.id}
                            className="grid grid-cols-3 gap-4 text-sm"
                          >
                            <span className="col-span-1 text-muted-foreground">
                              {field.fieldName}:
                            </span>
                            <div className="col-span-2">
                              <p className="font-medium text-foreground">
                                {field.fieldValue}
                              </p>
                              {field.notes && (
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  Note: {field.notes}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">
              No Matching Assessments Found
            </p>
            <p className="text-sm mt-1 text-muted-foreground">
              Try adjusting your filters or creating a new assessment.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <SimplePagination totalPages={totalPages} />
      </CardFooter>
    </Card>
  );
};

export default AnimalAssessmentsTab;
