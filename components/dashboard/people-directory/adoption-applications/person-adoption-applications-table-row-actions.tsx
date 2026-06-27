"use client";

import { Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { PersonAdoptionApplicationPayload } from "@/app/lib/data/people-directory/person-adoption-applications.data";

interface DataTableRowActionsProps {
  row: Row<PersonAdoptionApplicationPayload>;
  personId: string;
  canManage: boolean;
  canEdit: boolean;
}

export function DataTableRowActions({
  row,
  personId,
  canManage,
  canEdit,
}: DataTableRowActionsProps) {
  if (!canManage) {
    return null;
  }

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
        <Link href={`/dashboard/adoption-applications/${application.id}/edit`}>
          <DropdownMenuItem>Review</DropdownMenuItem>
        </Link>
        {canEdit && (
          <Link
            href={`/dashboard/people-directory/${personId}/adoption-applications/${application.id}/edit`}
          >
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
