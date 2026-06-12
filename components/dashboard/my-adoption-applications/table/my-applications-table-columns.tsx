"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ApplicationStatuses } from "./my-applications-options";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { DataTableRowActions } from "./my-applications-table-row-actions";
import { MyApplicationPayload } from "@/app/lib/types";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";
import Link from "next/link";

export const columns: ColumnDef<MyApplicationPayload>[] = [
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
    id: "animalName",
    accessorFn: (row) => row.animal.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pet Name" />
    ),
    meta: {
      displayName: "Animal Name",
    },
    cell: ({ row }) => {
      const status = ApplicationStatuses.find(
        (status) => status.value === row.original.status
      );
      const animal = row.original.animal;

      return (
        <div className="flex space-x-2">
          {status && <Badge variant="outline">{status.label}</Badge>}
          <Link
            href={`/pets/${animal.id}`}
            className="font-medium hover:underline"
          >
            {animal.name}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: "applicantName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant Name" />
    ),
    meta: {
      displayName: "Applicant Name",
    },
    cell: ({ row }) => {
      return (
        <span className="max-w-125 truncate">
          {row.getValue("applicantName")}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = ApplicationStatuses.find(
        (status) => status.value === row.getValue("status")
      );

      if (!status) {
        return null;
      }

      return (
        <Badge variant="outline" className="flex w-fit items-center">
          {status.icon && (
            <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{status.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "animalSpecies",
    accessorFn: (row) => row.animal.species.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pet Species" />
    ),
    meta: {
      displayName: "Species",
    },
    cell: ({ row }) => {
      return (
        <span className="max-w-100 truncate">
          {row.original.animal.species.name}
        </span>
      );
    },
  },
  {
    accessorKey: "submittedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Submitted At" />
    ),
    meta: {
      displayName: "Submitted At",
    },
    cell: ({ row }) => {
      const date = row.getValue("submittedAt") as string | Date | null;
      return <span>{formatTimeAgo(date)}</span>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
