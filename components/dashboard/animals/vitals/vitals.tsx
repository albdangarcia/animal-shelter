"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimplePagination } from "@/components/simple-pagination";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AnimalVitalsListPayload } from "@/app/lib/data/animals/animal-vitals.data";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import { formatWeight, formatTemperature } from "@/app/lib/utils/weight-format";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { VitalsActions } from "./vitals-actions";
import { VitalsForm } from "./vitals-form";

const vitalsStatusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

interface Props {
  vitalsLogs: AnimalVitalsListPayload[];
  animalId: string;
  totalPages: number;
  canManage: boolean;
  previousWeightGrams: number | null;
}

const AnimalVitalsTab = ({
  vitalsLogs,
  animalId,
  totalPages,
  canManage,
  previousWeightGrams,
}: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Vitals</CardTitle>
        <CardDescription>
          A dated log of weight, temperature, and body condition.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant={canManage ? "default" : "outline"}
                size="sm"
                className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                disabled={!canManage}
              >
                Record Vitals
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-150">
              <DialogHeader>
                <DialogTitle>Record Vitals</DialogTitle>
                <DialogDescription>
                  Record a dated weight, temperature, and/or body condition
                  score.
                </DialogDescription>
              </DialogHeader>
              <VitalsForm
                animalId={animalId}
                previousWeightGrams={previousWeightGrams}
                onFormSubmit={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={vitalsStatusOptions}
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Select order"
            options={[
              { label: "Newest First", value: "recordedAt.desc" },
              { label: "Oldest First", value: "recordedAt.asc" },
            ]}
          />
        </div>
      </CardHeader>

      <CardContent>
        {vitalsLogs.length > 0 ? (
          <div className="space-y-4">
            {vitalsLogs.map((vitalsLog) => (
              <div
                key={vitalsLog.id}
                className="border rounded-lg p-4 relative"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {formatDateToLongString(vitalsLog.recordedAt)}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        by {vitalsLog.recordedBy.name}
                      </span>
                      {vitalsLog.deletedAt && (
                        <Badge variant="destructive">Deleted</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
                      {vitalsLog.weightGrams != null && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Weight:{" "}
                          </span>
                          <span className="text-sm font-medium">
                            {formatWeight(vitalsLog.weightGrams)}
                          </span>
                        </div>
                      )}
                      {vitalsLog.temperatureC != null && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Temperature:{" "}
                          </span>
                          <span className="text-sm font-medium">
                            {formatTemperature(vitalsLog.temperatureC)}
                          </span>
                        </div>
                      )}
                      {vitalsLog.bodyConditionScore != null && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Body Condition:{" "}
                          </span>
                          <span className="text-sm font-medium">
                            {vitalsLog.bodyConditionScore}/9
                          </span>
                        </div>
                      )}
                    </div>

                    {vitalsLog.notes && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                        {vitalsLog.notes}
                      </p>
                    )}
                  </div>

                  <VitalsActions
                    vitalsLog={vitalsLog}
                    animalId={animalId}
                    canManage={canManage}
                    previousWeightGrams={previousWeightGrams}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">No Matching Vitals Found</p>
            <p className="text-sm mt-1 text-muted-foreground">
              Try adjusting your filters or recording a new vitals entry.
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

export default AnimalVitalsTab;
