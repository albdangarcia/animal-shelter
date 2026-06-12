"use client";

import { Table } from "@tanstack/react-table";
import { UsersPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { UserRoles } from "./users-options";

interface UsersTableToolbarProps {
  table: Table<UsersPayload>;
}

const UsersTableToolbar = ({ table }: UsersTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="emails-search"
      searchPlaceholder="Filter emails..."
      filterParamKeys={["role"]}
      filters={
        <ServerSideFacetedFilter title="Role" paramKey="role" options={UserRoles} />
      }
    />
  );
};

export default UsersTableToolbar;