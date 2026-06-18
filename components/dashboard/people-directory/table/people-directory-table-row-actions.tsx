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
import { PeopleDirectoryPayload } from "@/app/lib/types";

interface DataTableRowActionsProps {
  row: Row<PeopleDirectoryPayload>;
  canManage: boolean;
}

export function DataTableRowActions({ row, canManage }: DataTableRowActionsProps) {
  const person = row.original;

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
          <Link href={`/dashboard/people-directory/${person.id}`}>
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/dashboard/people-directory/${person.id}/edit?returnTo=/dashboard/people-directory`}
          >
            Edit Contact Info
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
