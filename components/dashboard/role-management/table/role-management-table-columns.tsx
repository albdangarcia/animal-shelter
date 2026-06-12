"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { UserRoles } from "./role-management-options";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { DataTableRowActions } from "./role-management-table-row-actions";
import { RoleManagementPayload } from "@/app/lib/types";

export const columns: ColumnDef<RoleManagementPayload>[] = [
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
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      return (
        <span className="truncate font-medium">{row.getValue("email")}</span>
      );
    },
  },
  {
    accessorKey: "person",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Person" />
    ),
    cell: ({ row }) => {
      const personName = row.original.person?.name;

      return (
        <div className="flex w-37.5 items-center">
          <span className="truncate font-medium">
            {personName || (
              <span className="text-muted-foreground italic">No link</span>
            )}
          </span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return row.original.person?.name
        .toLowerCase()
        .includes(value.toLowerCase());
    },
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const role = UserRoles.find((r) => r.value === row.original.role);
      if (!role)
        return (
          <span className="capitalize">{row.original.role.toLowerCase()}</span>
        );

      return (
        <Badge variant="outline" className={role.className}>
          {role.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "deactivatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const isDeactivated = !!row.original.deactivatedAt;
      return (
        <Badge variant={isDeactivated ? "destructive" : "outline"}>
          {isDeactivated ? "Deactivated" : "Active"}
        </Badge>
      );
    },
  },
  // {
  //   accessorKey: "lastLogin",
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title="Last Login" />
  //   ),
  //   cell: ({ row }) => {
  //     const lastLogin = row.original.lastLogin;
  //     return (
  //       <span className="text-sm text-muted-foreground">
  //         {lastLogin ? new Date(lastLogin).toLocaleDateString() : "Never"}
  //       </span>
  //     );
  //   },
  // },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
