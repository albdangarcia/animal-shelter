"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import { userApplicationStatusOptions } from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { AdoptionApplicationWithAnimal } from "@/app/lib/data/user-adoption-application.data";

interface UserAppTableToolbarProps {
  table: Table<StockFeatures, AdoptionApplicationWithAnimal>;
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