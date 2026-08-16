"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
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
import { AdoptionApplicationWithAnimal } from "@/app/lib/data/user-adoption-application.data";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, AdoptionApplicationWithAnimal>;
  canManage: boolean;
}

export function DataTableRowActions({ row, canManage }: DataTableRowActionsProps) {
  const userApplication = row.original;
  
  // Volunteers (read-only) get no row actions — every field is already
  // visible in the table, and all actions here are mutations.
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
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link href={`/dashboard/adoption-applications/${userApplication.id}/edit`}>
          <DropdownMenuItem>Review</DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
