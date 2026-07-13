"use client";

import { Row } from "@tanstack/react-table";
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
import { FosterApplicationListItem } from "@/app/lib/data/fosters/foster-applications.data";

interface DataTableRowActionsProps {
  row: Row<FosterApplicationListItem>;
  canManage: boolean;
}

// Unlike the adoption applications table, volunteers keep this action:
// they can view the detail/review page read-only, they just don't see the status-change controls once there.
export function DataTableRowActions({ row, canManage }: DataTableRowActionsProps) {
  const application = row.original;

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
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link href={`/dashboard/foster-applications/${application.id}`}>
          <DropdownMenuItem>{canManage ? "Review" : "View"}</DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
