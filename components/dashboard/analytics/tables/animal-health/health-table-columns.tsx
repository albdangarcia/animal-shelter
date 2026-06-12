"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableRowActions } from "./health-table-row-actions";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import { AnimalsRequiringAttentionPayload } from "@/app/lib/data/analytics.data";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import Link from "next/link";

export const healthColumns: ColumnDef<AnimalsRequiringAttentionPayload>[] = [
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
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {

      return (
        <span className="font-medium hover:underline">
          <Link href={`/dashboard/animals/${row.original.id}`}>
            {row.getValue("name")}
          </Link>
        </span>
      );
    },
  },
  {
    accessorKey: "healthStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Health Status" />
    ),
    meta: {
      displayName: "Health Status",
    },
    cell: ({ row }) => {
      const status = row.getValue("healthStatus") as string;
      return <Badge variant="outline">{formatSingleEnumOption(status)}</Badge>;
    },
  },
  {
    accessorKey: "legalStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Legal Status" />
    ),
    meta: {
      displayName: "Legal Status",
    },
    cell: ({ row }) => {
      const status = row.getValue("legalStatus") as string;
      return <Badge variant="outline">{formatSingleEnumOption(status)}</Badge>;
    },
  },
  {
    accessorKey: "intakeDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Intake Date" />
    ),
    meta: {
      displayName: "Intake Date",
    },
    cell: ({ row }) => {
      const date = row.getValue("intakeDate") as string | Date | null;
      return <span>{formatDateOrNA(date)}</span>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
