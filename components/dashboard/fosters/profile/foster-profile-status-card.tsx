"use client";

import { startTransition, useActionState, useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { FosterStatus } from "@prisma/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  updateFosterProfileCapabilities,
  updateFosterProfileStatus,
} from "@/app/lib/actions/foster-application.actions";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import {
  FosterApplicationFormSchema,
  FosterCapabilityFieldsSchema,
} from "@/app/lib/zod-schemas/foster.schemas";
import { FosterCapabilityFormFields } from "@/components/dashboard/my-foster-application/foster-capability-form-fields";
import { FosterProfileForTab } from "@/app/lib/data/fosters/fosters.data";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";
import { FosterStatuses } from "@/components/dashboard/fosters/table/foster-options";

type CapabilityFormValues = z.input<typeof FosterCapabilityFieldsSchema>;

// FosterCapabilityFormFields is typed against the full foster application
// form; this card only carries the capability subset, reused via a cast —
// same convention as DirectAddFosterForm.
type FosterApplicationFormValues = z.input<typeof FosterApplicationFormSchema>;

const boolDisplay = (val: boolean | null | undefined) => {
  if (val === null || val === undefined) return "N/A";
  return val ? "Yes" : "No";
};

const CapabilityReadOnlyRows = ({ profile }: { profile: FosterProfileForTab }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Species</span>
      <span>
        {profile.speciesCapabilities.length > 0
          ? profile.speciesCapabilities.map((s) => s.name).join(", ")
          : "N/A"}
      </span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Max Animals</span>
      <span>{profile.maxAnimals}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Quarantine Space</span>
      <span>{boolDisplay(profile.hasQuarantineSpace)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Give Oral Meds</span>
      <span>{boolDisplay(profile.canGiveOralMeds)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Bottle-Feed</span>
      <span>{boolDisplay(profile.canBottleFeed)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Can Transport</span>
      <span>{boolDisplay(profile.canTransport)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Accepts Medical Cases</span>
      <span>{boolDisplay(profile.acceptsMedical)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Accepts Hospice Cases</span>
      <span>{boolDisplay(profile.acceptsHospice)}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Availability Notes</span>
      <span>{profile.availabilityNotes || "N/A"}</span>
    </div>
  </div>
);

interface StatusAction {
  label: string;
  nextStatus: FosterStatus;
  description: string;
}

// INACTIVE has no "Deactivate" option since it's already inactive; the other
// two statuses each get a reversible toggle plus Deactivate.
const statusActions: Record<FosterStatus, StatusAction[]> = {
  ACTIVE: [
    {
      label: "Pause",
      nextStatus: FosterStatus.PAUSED,
      description:
        "Pausing stops new placements from being created for this foster. Any placement already in progress is unaffected.",
    },
    {
      label: "Deactivate",
      nextStatus: FosterStatus.INACTIVE,
      description: "Deactivating removes this foster from the active roster.",
    },
  ],
  PAUSED: [
    {
      label: "Resume",
      nextStatus: FosterStatus.ACTIVE,
      description:
        "Resuming allows new placements to be created for this foster again.",
    },
    {
      label: "Deactivate",
      nextStatus: FosterStatus.INACTIVE,
      description: "Deactivating removes this foster from the active roster.",
    },
  ],
  INACTIVE: [
    {
      label: "Reactivate",
      nextStatus: FosterStatus.ACTIVE,
      description: "Reactivating restores this foster to the active roster.",
    },
  ],
};

interface FosterProfileStatusCardProps {
  profile: FosterProfileForTab;
  canManage: boolean;
  species: { id: string; name: string }[];
  hasOpenPlacement: boolean;
}

export function FosterProfileStatusCard({
  profile,
  canManage,
  species,
  hasOpenPlacement,
}: FosterProfileStatusCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<StatusAction | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();

  const boundCapabilityAction = updateFosterProfileCapabilities.bind(
    null,
    profile.id,
  );
  const [capabilityState, capabilityFormAction, isCapabilityPending] =
    useActionState(boundCapabilityAction, INITIAL_FORM_STATE);

  const form = useForm<CapabilityFormValues>({
    resolver: standardSchemaResolver(FosterCapabilityFieldsSchema),
    defaultValues: {
      speciesIds: profile.speciesCapabilities.map((s) => s.id),
      maxAnimals: String(profile.maxAnimals),
      hasQuarantineSpace: boolToSelectValue(profile.hasQuarantineSpace),
      canGiveOralMeds: boolToSelectValue(profile.canGiveOralMeds),
      canBottleFeed: boolToSelectValue(profile.canBottleFeed),
      canTransport: boolToSelectValue(profile.canTransport),
      acceptsMedical: boolToSelectValue(profile.acceptsMedical),
      acceptsHospice: boolToSelectValue(profile.acceptsHospice),
      availabilityNotes: profile.availabilityNotes || "",
    },
  });

  useEffect(() => {
    if (capabilityState.success) {
      toast.success(capabilityState.message ?? "Foster capabilities updated.");
      setIsEditing(false);
    } else if (capabilityState.message) {
      toast.error(capabilityState.message);
    }
    if (capabilityState.errors) {
      for (const [key, value] of Object.entries(capabilityState.errors)) {
        if (value) {
          form.setError(key as keyof CapabilityFormValues, {
            type: "server",
            message: Array.isArray(value) ? value.join(", ") : String(value),
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilityState]);

  const onSubmit = (data: CapabilityFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (key === "speciesIds") {
        (value as string[] | undefined)?.forEach((id) =>
          formData.append("speciesIds", id),
        );
      } else if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }
    startTransition(() => {
      capabilityFormAction(formData);
    });
  };

  const handleCancel = () => {
    form.reset();
    setIsEditing(false);
  };

  const onConfirmStatusChange = () => {
    if (!confirmAction) return;
    startStatusTransition(async () => {
      const result = await updateFosterProfileStatus(
        profile.id,
        confirmAction.nextStatus,
      );
      if (result.success) {
        toast.success(result.message ?? "Foster status updated.");
        setConfirmAction(null);
      } else {
        toast.error(result.message || "Failed to update foster status.");
      }
    });
  };

  const statusMeta = FosterStatuses.find((s) => s.value === profile.status);

  if (isEditing) {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Foster Capabilities</CardTitle>
              <CardDescription>What this foster can take on.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-10">
              <FosterCapabilityFormFields
                form={
                  form as unknown as ReturnType<
                    typeof useForm<FosterApplicationFormValues>
                  >
                }
                species={species}
              />
            </CardContent>
            <CardFooter className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isCapabilityPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCapabilityPending}>
                {isCapabilityPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isCapabilityPending ? "Saving..." : "Save"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    );
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl flex items-center gap-2">
          Foster Status
          {statusMeta && (
            <Badge variant="outline" className="flex w-fit items-center">
              <statusMeta.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {statusMeta.label}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Roster status and foster capabilities.</CardDescription>
        {canManage && (
          <CardAction className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit Capabilities
            </Button>
            {statusActions[profile.status].map((action) => {
              const disabled =
                action.nextStatus === FosterStatus.INACTIVE && hasOpenPlacement;
              return (
                <Button
                  key={action.nextStatus}
                  variant="outline"
                  size="sm"
                  disabled={disabled || isStatusPending}
                  title={
                    disabled
                      ? "Return this foster's open placement(s) first."
                      : undefined
                  }
                  onClick={() => setConfirmAction(action)}
                >
                  {action.label}
                </Button>
              );
            })}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <CapabilityReadOnlyRows profile={profile} />
      </CardContent>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.label} this foster?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStatusPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirmStatusChange();
              }}
              disabled={isStatusPending}
            >
              {isStatusPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
