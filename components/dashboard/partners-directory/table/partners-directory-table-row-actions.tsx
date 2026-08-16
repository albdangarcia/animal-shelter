"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PartnersDirectoryPayload } from "@/app/lib/types";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, PartnersDirectoryPayload>;
  canManage: boolean;
}

export function DataTableRowActions({
  row,
  canManage,
}: DataTableRowActionsProps) {
  const partner = row.original;

  // Volunteers (read-only) get no row actions — every field is already
  // visible in the table, and all actions here are mutations.
  if (!canManage) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/partners-directory/${partner.id}`}>
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/dashboard/partners-directory/${partner.id}/edit?returnTo=/dashboard/partners-directory`}
          >
            Edit Partner Info
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}