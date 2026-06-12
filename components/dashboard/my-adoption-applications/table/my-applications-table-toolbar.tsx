"use client";

import { Table } from "@tanstack/react-table";
import { myApplicationStatusOptions } from "@/app/lib/utils/enum-formatter";
import { MyApplicationPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";

interface MyAppTableToolbarProps {
  table: Table<MyApplicationPayload>;
}

const MyAppTableToolbar = ({ table }: MyAppTableToolbarProps) => {
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
          options={myApplicationStatusOptions}
        />
      }
    />
  );
};

export default MyAppTableToolbar;