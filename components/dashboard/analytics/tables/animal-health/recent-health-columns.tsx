"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import type { AnimalUnderCarePayload } from "@/app/lib/data/analytics.data";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import Link from "next/link";
import { DataTableRowActions } from "./recent-health-row-actions";

export const healthColumns: ColumnDef<StockFeatures, AnimalUnderCarePayload>[] = [
  {
    accessorKey: "animal.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    meta: {
      displayName: "Name",
    },
    cell: ({ row }) => (
      <span className="font-medium hover:underline">
        <Link href={`/dashboard/animals/${row.original.animal.id}`}>
          {row.original.animal.name}
        </Link>
      </span>
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Care" />
    ),
    meta: {
      displayName: "Care",
    },
    cell: ({ row }) => (
      <Badge variant="outline">{CARE_EPISODE_TYPE_LABELS[row.original.type]}</Badge>
    ),
  },
  {
    accessorKey: "startDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Since" />
    ),
    meta: {
      displayName: "Since",
    },
    // The column holds a calendar day; a table cell reads it untyped.
    cell: ({ row }) => <span>{formatShelterDayOrNA(row.original.startDate)}</span>,
  },
  {
    accessorKey: "where",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Where" />
    ),
    meta: {
      displayName: "Where",
    },
    cell: ({ row }) => <span>{row.original.where}</span>,
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
