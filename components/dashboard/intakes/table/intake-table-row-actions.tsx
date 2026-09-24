"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IntakeWithDetails } from "@/app/lib/data/animals/intake.data";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, IntakeWithDetails>;
  canManage: boolean;
}

export function DataTableRowActions({
  row,
  canManage,
}: DataTableRowActionsProps) {
  // Readers without the authority to correct an intake have nothing to do
  // with a row, so they get no menu at all.
  if (!canManage) {
    return null;
  }

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
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/intakes/${row.original.id}/edit`}>
            Edit…
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
