"use client";

import { Table } from "@tanstack/react-table";
import { userApplicationStatusOptions } from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { ApplicationWithAnimal } from "@/app/lib/data/user-application.data";

interface UserAppTableToolbarProps {
  table: Table<ApplicationWithAnimal>;
}

const UserAppTableToolbar = ({ table }: UserAppTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="applications-search"
      searchPlaceholder="Filter Applications..."
      filterParamKeys={["status"]}
      filters={
        <ServerSideFacetedFilter
          title="Status"
          paramKey="status"
          options={userApplicationStatusOptions}
        />
      }
    />
  );
};

export default UserAppTableToolbar;