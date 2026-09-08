"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  reactivateMyAdoptionApplication,
  withdrawMyAdoptionApplication,
} from "@/app/lib/actions/my-adoption-application.actions";
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
}: {
  applicationId: string;
  status: ApplicationStatus;
}) => {
  const [isPending, startTransition] = useTransition();

  const onWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawMyAdoptionApplication(applicationId);
      if (result.success) {
        toast.success(result.message ?? "Application withdrawn successfully.");
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

      {status === ApplicationStatus.WITHDRAWN && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReactivate}
          disabled={isPending}
        >
          Reactivate
        </Button>
      )}

      {!NON_WITHDRAWABLE_STATUSES.includes(status) && (
        <Button
          variant="outline"
          size="sm"
          onClick={onWithdraw}
          disabled={isPending}
        >
          Withdraw application
        </Button>
      )}
    </div>
  );
};
