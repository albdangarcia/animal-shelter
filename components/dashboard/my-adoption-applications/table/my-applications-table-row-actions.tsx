"use client";

import { Row } from "@tanstack/react-table";
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
import { MyApplicationPayload } from "@/app/lib/types";
import Link from "next/link";
import { toast } from "sonner";
import {
  reactivateMyApplication,
  withdrawMyApplication,
} from "@/app/lib/actions/my-application.action";
import { ApplicationStatus } from "@prisma/client";

interface DataTableRowActionsProps {
  row: Row<MyApplicationPayload>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const myApplication = row.original;
  const [isPending, startTransition] = useTransition();

  const onWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawMyApplication(myApplication.id);
      if (result.success) {
        toast.success("Application withdrawn successfully.");
      } else {
        toast.error(result.message || "Failed to withdraw application.");
      }
    });
  };

  const onReactivate = () => {
    startTransition(async () => {
      const result = await reactivateMyApplication(myApplication.id);
      if (result.success) {
        toast.success("Application reactivated successfully.");
      } else {
        toast.error(result.message || "Failed to reactivate application.");
      }
    });
  };

  // Check if the application can be edited
  const isEditable = myApplication.status === ApplicationStatus.PENDING;

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
        {/* Only show Edit link if the application is in PENDING status */}
        {isEditable && (
          <>
            <Link href={`/dashboard/my-applications/${myApplication.id}/edit`}>
              <DropdownMenuItem>Edit</DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
          </>
        )}

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
