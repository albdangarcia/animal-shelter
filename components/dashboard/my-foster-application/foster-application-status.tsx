"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApplicationStatus } from "@prisma/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withdrawMyFosterApplication } from "@/app/lib/actions/foster-application.actions";
import { MyFosterApplicationPayload } from "@/app/lib/types";
import { formatDateOrNA, formatTimeAgo } from "@/app/lib/utils/date-utils";
import { ApplicationStatuses } from "@/components/dashboard/my-adoption-applications/table/my-applications-options";
import { HouseholdReadOnlyRows } from "@/components/dashboard/account/household-profile-form";

const boolDisplay = (val: boolean | null | undefined) => {
  if (val === null || val === undefined) return "N/A";
  return val ? "Yes" : "No";
};

const terminalStatuses: ApplicationStatus[] = [
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.REJECTED,
];

export const CapabilityReadOnlyRows = ({
  application,
}: {
  application: MyFosterApplicationPayload;
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Species</span>
      <span>
        {application.speciesCapabilities.length > 0
          ? application.speciesCapabilities.map((s) => s.name).join(", ")
          : "N/A"}
      </span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Max Animals</span>
      <span>{application.maxAnimals}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Quarantine Space</span>
      <span>{boolDisplay(application.hasQuarantineSpace)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Give Oral Meds</span>
      <span>{boolDisplay(application.canGiveOralMeds)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Bottle-Feed</span>
      <span>{boolDisplay(application.canBottleFeed)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Transport</span>
      <span>{boolDisplay(application.canTransport)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Accepts Medical Cases</span>
      <span>{boolDisplay(application.acceptsMedical)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Accepts Hospice Cases</span>
      <span>{boolDisplay(application.acceptsHospice)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Availability Notes</span>
      <span>{application.availabilityNotes || "N/A"}</span>
    </div>
  </div>
);

export const StatusHistoryTimeline = ({
  history,
}: {
  history: MyFosterApplicationPayload["history"];
}) => (
  <div className="space-y-6">
    {history.map((entry) => {
      const meta = ApplicationStatuses.find((s) => s.value === entry.status);
      const Icon = meta?.icon;
      return (
        <div key={entry.id} className="relative flex items-start space-x-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-4 ring-card">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0 grow">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <Badge variant="outline">{meta?.label ?? entry.status}</Badge>
              {entry.changedBy && (
                <span className="text-muted-foreground">
                  by {entry.changedBy.name}
                </span>
              )}
              <span className="text-muted-foreground/70">
                &bull; {formatTimeAgo(entry.changedAt)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.statusChangeReason}
            </p>
          </div>
        </div>
      );
    })}
  </div>
);

export function FosterApplicationStatus({
  application,
}: {
  application: MyFosterApplicationPayload;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const statusMeta = ApplicationStatuses.find(
    (s) => s.value === application.status,
  );
  const canWithdraw = !terminalStatuses.includes(application.status);

  const onWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawMyFosterApplication(application.id);
      if (result.success) {
        toast.success(result.message ?? "Foster application withdrawn.");
        setConfirmOpen(false);
      } else {
        toast.error(result.message || "Failed to withdraw application.");
      }
    });
  };

  return (
    <div className="space-y-8">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl flex items-center gap-2">
            My Foster Application
            {statusMeta && (
              <Badge variant="outline" className="flex w-fit items-center">
                {statusMeta.icon && (
                  <statusMeta.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                {statusMeta.label}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Submitted {formatDateOrNA(application.submittedAt)}.
          </CardDescription>
          {canWithdraw && (
            <CardAction>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isPending}>
                    Withdraw Application
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Withdraw your foster application?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will withdraw your current application. You can
                      submit a new one afterward if you change your mind.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        onWithdraw();
                      }}
                      disabled={isPending}
                    >
                      {isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Withdraw
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardAction>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Household & Lifestyle</CardTitle>
        </CardHeader>
        <CardContent>
          <HouseholdReadOnlyRows hp={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foster Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <CapabilityReadOnlyRows application={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusHistoryTimeline history={application.history} />
        </CardContent>
      </Card>
    </div>
  );
}
