"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SimplePagination } from "@/components/simple-pagination";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { cn } from "@/lib/utils";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import { SIGNAL_ORDER, formatSignal } from "@/app/lib/assessments/signal";
import type { AnimalAssessmentListItem } from "@/app/lib/data/animals/animal-assessment.data";
import { AssessmentActions } from "./assessment-actions";
import { SignalBadge } from "./signal-badge";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

const signalOptions = SIGNAL_ORDER.map((s) => ({
  value: s,
  label: formatSignal(s),
}));

interface Props {
  assessments: AnimalAssessmentListItem[];
  animalId: string;
  totalPages: number;
  canManage: boolean;
}

const AnimalAssessmentsTab = ({
  assessments,
  animalId,
  totalPages,
  canManage,
}: Props) => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Assessments</CardTitle>
        <CardDescription>
          Structured checks recorded against this animal, newest first.
        </CardDescription>
        <CardAction>
          <span className={cn("inline-block", !canManage && "cursor-not-allowed")}>
            <Button
              asChild
              size="sm"
              variant={canManage ? "default" : "outline"}
              className={cn(!canManage && "pointer-events-none opacity-50")}
            >
              <Link
                href={`/dashboard/animals/${animalId}/assessments/create`}
                aria-disabled={!canManage}
                tabIndex={canManage ? undefined : -1}
                onClick={(e) => {
                  if (!canManage) e.preventDefault();
                }}
              >
                Record Assessment
              </Link>
            </Button>
          </span>
        </CardAction>

        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Signal"
            paramKey="signal"
            options={signalOptions}
          />
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={statusOptions}
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Select order"
            options={[
              { label: "Newest First", value: "observedAt.desc" },
              { label: "Oldest First", value: "observedAt.asc" },
            ]}
          />
        </div>
      </CardHeader>

      <CardContent>
        {assessments.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {assessments.map((assessment) => (
              <AccordionItem value={assessment.id} key={assessment.id}>
                <div className="flex w-full items-center justify-between">
                  <AccordionTrigger className="flex-1 text-left hover:no-underline">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-primary">
                        {assessment.template.name}
                      </span>
                      <span className="text-sm whitespace-nowrap text-muted-foreground">
                        on {formatDateToLongString(assessment.observedAt)}
                      </span>
                      <span className="text-sm whitespace-nowrap text-muted-foreground">
                        by {assessment.assessor.name}
                      </span>
                      <SignalBadge signal={assessment.signal} />
                      {assessment.deletedAt && (
                        <Badge variant="destructive">Deleted</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <div className="mt-2 self-start pl-2">
                    <AssessmentActions
                      assessmentId={assessment.id}
                      animalId={animalId}
                      isDeleted={!!assessment.deletedAt}
                      canManage={canManage}
                    />
                  </div>
                </div>

                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {assessment.summary && (
                      <div>
                        <h4 className="font-semibold">Summary</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {assessment.summary}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div>
                      <h4 className="font-semibold">Findings</h4>
                      {assessment.answers.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                          {assessment.answers.map((answer) => (
                            <li
                              key={answer.id}
                              className="grid grid-cols-3 gap-4 text-sm"
                            >
                              <span className="col-span-1 text-muted-foreground">
                                {answer.questionLabel}
                              </span>
                              <div className="col-span-2">
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
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="rounded-lg border-2 border-dashed py-12 text-center">
            <p className="text-lg font-semibold">No Matching Assessments Found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your filters or recording a new assessment.
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
