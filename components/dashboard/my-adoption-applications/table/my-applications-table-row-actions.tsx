"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyAdoptionApplicationPayload } from "@/app/lib/types";
import Link from "next/link";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, MyAdoptionApplicationPayload>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const myApplication = row.original;

  // View is the only row action. Withdraw and Reactivate used to live here
  // too, but Withdraw was offered even at REJECTED/ADOPTED/CLOSED — where the
  // action always refuses and could only ever produce a raw-enum error toast —
  // and Reactivate was always enabled even once the animal had left the
  // shelter. Both now live on the view page, next to the status context and
  // the consequence copy, with a confirmation dialog and a disabled state.
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
        <Link href={`/dashboard/my-adoption-applications/${myApplication.id}`}>
          <DropdownMenuItem>View application</DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
