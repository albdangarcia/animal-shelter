"use client";

import { Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { FosterStatus } from "@/prisma/generated/enums";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FosterRosterListItem } from "@/app/lib/data/fosters/fosters.data";

interface DataTableRowActionsProps {
  row: Row<FosterRosterListItem>;
  canManage: boolean;
}

export function DataTableRowActions({ row, canManage }: DataTableRowActionsProps) {
  const foster = row.original;
  const canPlace =
    canManage &&
    foster.status === FosterStatus.ACTIVE &&
    foster._count.placements < foster.maxAnimals;

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
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/people-directory/${foster.person.id}/fostering`}>
            View Profile
          </Link>
        </DropdownMenuItem>
        {canManage && canPlace && (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/fosters/placements/new?fosterProfileId=${foster.id}`}>
              New Placement
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
