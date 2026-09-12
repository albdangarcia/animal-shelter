"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FosterApplicationStatuses } from "./foster-applications-options";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import { DataTableRowActions } from "./foster-applications-table-row-actions";
import { FosterApplicationListItem } from "@/app/lib/data/fosters/foster-applications.data";
import { TimeAgo } from "@/components/common/time-ago";

export interface GetColumnsProps {
  canManage: boolean;
}

export const getColumns = ({
  canManage,
}: GetColumnsProps): ColumnDef<StockFeatures, FosterApplicationListItem>[] => [
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
    accessorKey: "applicantName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant Name" />
    ),
    meta: {
      displayName: "Applicant Name",
    },
    cell: ({ row }) => (
      <Link
        href={`/dashboard/foster-applications/${row.original.id}`}
        className="max-w-125 truncate font-medium hover:underline"
      >
        {row.getValue("applicantName")}
      </Link>
    ),
  },
  {
    accessorKey: "applicantEmail",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant Email" />
    ),
    meta: {
      displayName: "Applicant Email",
    },
    cell: ({ row }) => (
      <span className="max-w-100 truncate">
        {row.getValue("applicantEmail")}
      </span>
    ),
  },
  {
    accessorKey: "applicantPhone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant Phone" />
    ),
    meta: {
      displayName: "Applicant Phone",
    },
    cell: ({ row }) => (
      <span className="max-w-100 truncate">
        {row.getValue("applicantPhone")}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = FosterApplicationStatuses.find(
        (status) => status.value === row.getValue("status"),
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
    accessorKey: "maxAnimals",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Max Animals" />
    ),
    meta: {
      displayName: "Max Animals",
    },
    cell: ({ row }) => <span>{row.getValue("maxAnimals")}</span>,
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
      return <TimeAgo date={date} />;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} canManage={canManage} />,
  },
];
