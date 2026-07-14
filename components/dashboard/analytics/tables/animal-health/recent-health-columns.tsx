"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import { AnimalsRequiringAttentionPayload } from "@/app/lib/data/analytics.data";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import Link from "next/link";
import { DataTableRowActions } from "./recent-health-row-actions";

export const healthColumns: ColumnDef<AnimalsRequiringAttentionPayload>[] = [
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