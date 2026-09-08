"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import {
  AnimalListingStatus,
  ApplicationStatus,
} from "@/prisma/generated/enums";
import {
  reactivateMyAdoptionApplication,
  withdrawMyAdoptionApplication,
} from "@/app/lib/actions/my-adoption-application.actions";
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
import { Button } from "@/components/ui/button";

// The statuses the withdraw action refuses, mirrored from
// `withdrawMyAdoptionApplication` so the button is absent rather than present
// and guaranteed to fail.
const NON_WITHDRAWABLE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.ADOPTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.REJECTED,
  ApplicationStatus.CLOSED,
];

export const MyApplicationActions = ({
  applicationId,
  status,
  animalName,
  animalListingStatus,
}: {
  applicationId: string;
  status: ApplicationStatus;
  animalName: string;
  animalListingStatus: AnimalListingStatus;
}) => {
  const [isPending, startTransition] = useTransition();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const onWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawMyAdoptionApplication(applicationId);
      if (result.success) {
        toast.success(result.message ?? "Application withdrawn successfully.");
        setWithdrawOpen(false);
      } else {
        toast.error(result.message || "Failed to withdraw application.");
      }
    });
  };

  const onReactivate = () => {
    startTransition(async () => {
      const result = await reactivateMyAdoptionApplication(applicationId);
      if (result.success) {
        toast.success(result.message ?? "Application reactivated successfully.");
      } else {
        toast.error(result.message || "Failed to reactivate application.");
      }
    });
  };

  // The reactivate action requires the animal still be PUBLISHED
  // (`my-adoption-application.actions.ts`). Offered blindly on every WITHDRAWN
  // row it just fails with an error toast on an adopted-out animal, so it is
  // rendered disabled with the reason instead.
  const canReactivate = animalListingStatus === AnimalListingStatus.PUBLISHED;

  // Approving an application holds the animal (PENDING_ADOPTION); withdrawing
  // it then releases the animal back to PUBLISHED for other applicants. The
  // dialog has to name that consequence — at every other status withdrawing
  // only affects this application.
  const withdrawReleasesAnimal = status === ApplicationStatus.APPROVED;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === ApplicationStatus.PENDING && (
        <Button asChild size="sm">
          <Link
            href={`/dashboard/my-adoption-applications/${applicationId}/edit`}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit application
          </Link>
        </Button>
      )}

      {status === ApplicationStatus.WITHDRAWN &&
        (canReactivate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onReactivate}
            disabled={isPending}
          >
            Reactivate
          </Button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" disabled>
              Reactivate
            </Button>
            <span className="text-xs text-muted-foreground">
              {animalName} has left the shelter, so this application can no
              longer be reactivated.
            </span>
          </div>
        ))}

      {!NON_WITHDRAWABLE_STATUSES.includes(status) && (
        <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              Withdraw application
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw your application?</AlertDialogTitle>
              <AlertDialogDescription>
                {withdrawReleasesAnimal
                  ? `${animalName} is currently being held for you while the adoption is arranged. Withdrawing your application releases ${animalName} back to the adoptable listings, where other people can apply. You can reactivate this application afterward while ${animalName} is still listed.`
                  : `This withdraws your application for ${animalName}. While ${animalName} is still listed for adoption you can reactivate it from this page afterward.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onWithdraw();
                }}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Withdraw
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};
