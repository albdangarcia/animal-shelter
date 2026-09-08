"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyAdoptionApplicationPayload } from "@/app/lib/types";
import Link from "next/link";
import { toast } from "sonner";
import {
  reactivateMyAdoptionApplication,
  withdrawMyAdoptionApplication,
} from "@/app/lib/actions/my-adoption-application.actions";
import { ApplicationStatus } from "@/prisma/generated/enums";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, MyAdoptionApplicationPayload>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const myApplication = row.original;
  const [isPending, startTransition] = useTransition();

  const onWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawMyAdoptionApplication(myApplication.id);
      if (result.success) {
        toast.success("Application withdrawn successfully.");
      } else {
        toast.error(result.message || "Failed to withdraw application.");
      }
    });
  };

  const onReactivate = () => {
    startTransition(async () => {
      const result = await reactivateMyAdoptionApplication(myApplication.id);
      if (result.success) {
        toast.success("Application reactivated successfully.");
      } else {
        toast.error(result.message || "Failed to reactivate application.");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {/* The one link to an application, so it is offered at every status.
            "Edit" used to sit here gated on PENDING, which left the applicant
            with no way back into their own application at the other seven. The
            view page carries the "Edit application" button when it applies. */}
        <Link href={`/dashboard/my-adoption-applications/${myApplication.id}`}>
          <DropdownMenuItem>View application</DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />

        {/* Conditionally render Withdraw or Reactivate */}
        {myApplication.status === ApplicationStatus.WITHDRAWN ? (
          <DropdownMenuItem onClick={onReactivate} disabled={isPending}>
            Reactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onClick={onWithdraw}
            disabled={isPending}
          >
            Withdraw
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
