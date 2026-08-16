"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { DataTableRowActions } from "./partners-directory-table-row-actions";
import { PartnersDirectoryPayload } from "@/app/lib/types";
import { PartnerTypesOptions, ActiveStatusesOptions } from "./partners-directory-options";

export interface GetColumnsProps {
  canManage: boolean;
}

export const getColumns = ({
  canManage,
}: GetColumnsProps): ColumnDef<StockFeatures, PartnersDirectoryPayload>[] => [
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
        <Link
          href={`/dashboard/partners-directory/${row.original.id}`}
          className="font-medium hover:underline truncate"
        >
          {row.getValue("name")}
        </Link>
      );
    },
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = PartnerTypesOptions.find((t) => t.value === row.getValue("type"));
      if (!type) return null;

      const Icon = type.icon;
      return (
        <Badge variant="outline" className={type.className}>
          <Icon className="mr-1 h-3 w-3" />
          {type.label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "status",
    accessorFn: (row) => (row.isActive ? "active" : "inactive"),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = ActiveStatusesOptions.find(
        (s) => s.value === row.getValue("status"),
      );
      if (!status) return null;

      const Icon = status.icon;
      return (
        <Badge variant="outline" className={status.className}>
          <Icon className="mr-1 h-3 w-3" />
          {status.label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
    enableSorting: false,
  },
  {
    id: "contacts",
    accessorFn: (row) => row._count.contacts,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contacts" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("contacts") as number;
      return (
        <span className="tabular-nums">
          {count > 0 ? (
            count
          ) : (
            <span className="text-muted-foreground italic">—</span>
          )}
        </span>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      const email = row.getValue("email") as string | null;
      return (
        <span className="truncate">
          {email || <span className="text-muted-foreground italic">—</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "city",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="City" />
    ),
    cell: ({ row }) => {
      const city = row.getValue("city") as string | null;
      return (
        <span className="truncate">
          {city || <span className="text-muted-foreground italic">—</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "state",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="State" />
    ),
    cell: ({ row }) => {
      const state = row.getValue("state") as string | null;
      return (
        <span className="truncate">
          {state || <span className="text-muted-foreground italic">—</span>}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} canManage={canManage} />,
  },
];