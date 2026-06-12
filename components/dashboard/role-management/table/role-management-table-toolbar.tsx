"use client";

import { Table } from "@tanstack/react-table";
import { RoleManagementPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { UserRoles, UserStatuses } from "./role-management-options";

interface UsersTableToolbarProps {
  table: Table<RoleManagementPayload>;
}

const UsersTableToolbar = ({ table }: UsersTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="user-search"
      searchPlaceholder="Filter by email or name..."
      filterParamKeys={["role", "status"]}
      filters={
        <>
        <ServerSideFacetedFilter title="Role" paramKey="role" options={UserRoles} />
        <ServerSideFacetedFilter title="Status" paramKey="status" options={UserStatuses} />
        </>
      }
    />
  );
};

export default UsersTableToolbar;