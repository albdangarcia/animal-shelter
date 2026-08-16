"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import { DataTableRowActions } from "./foster-table-row-actions";
import { FosterRosterListItem } from "@/app/lib/data/fosters/fosters.data";
import { FosterStatuses } from "./foster-options";

export interface GetColumnsProps {
  canManage: boolean;
  // Unused by the columns themselves — shared with the toolbar because
  // DataTable's columnProps and toolbarProps are the same generic type
  // parameter (see the animal tasks table for the same convention).
  speciesOptions: { label: string; value: string }[];
}

export const getColumns = ({
  canManage,
}: GetColumnsProps): ColumnDef<StockFeatures, FosterRosterListItem>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-0.5"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-0.5"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "personName",
    accessorFn: (row) => row.person.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/dashboard/people-directory/${row.original.person.id}/fostering`}
        className="font-medium hover:underline truncate"
      >
        {row.original.person.name}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = FosterStatuses.find(
        (status) => status.value === row.getValue("status"),
      );
      if (!status) return null;

      return (
        <Badge variant="outline" className="flex w-fit items-center">
          <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{status.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "species",
    accessorFn: (row) => row.speciesCapabilities.map((s) => s.name).join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Species" />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const names = row.original.speciesCapabilities;
      return names.length > 0 ? (
        <span className="truncate">{names.map((s) => s.name).join(", ")}</span>
      ) : (
        <span className="text-muted-foreground italic">—</span>
      );
    },
  },
  {
    id: "capacity",
    // Sourced from a filtered relation count (open placements) compared
    // against a plain column (maxAnimals) — the same reason it can't be a
    // `where` filter server-side (see fetchFosters) means it can't be a
    // cheap server-side sort either, so sorting is skipped here.
    accessorFn: (row) => `${row._count.placements}/${row.maxAnimals}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Capacity" />
    ),
    enableSorting: false,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original._count.placements}/{row.original.maxAnimals}
      </span>
    ),
  },
  {
    id: "fosteringNow",
    accessorFn: (row) => row.placements.map((p) => p.animal.name).join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fostering Now" />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const placements = row.original.placements;
      if (placements.length === 0) {
        return <span className="text-muted-foreground italic">—</span>;
      }
      return (
        <span className="flex flex-wrap gap-x-2">
          {placements.map(({ animal }, index) => (
            <span key={animal.id}>
              <Link
                href={`/dashboard/animals/${animal.id}`}
                className="hover:underline"
              >
                {animal.name}
              </Link>
              {index < placements.length - 1 && ","}
            </span>
          ))}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} canManage={canManage} />,
  },
];
