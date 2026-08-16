"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import { FosterCapacityOptions, FosterStatuses } from "./foster-options";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { FosterRosterListItem } from "@/app/lib/data/fosters/fosters.data";

interface FostersTableToolbarProps {
  table: Table<StockFeatures, FosterRosterListItem>;
  speciesOptions: { label: string; value: string }[];
  canManage: boolean;
}

const FostersTableToolbar = ({ table, speciesOptions }: FostersTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="fosters-search"
      searchPlaceholder="Filter by name, email, or phone..."
      filterParamKeys={["status", "species", "capacity"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={FosterStatuses}
          />
          <ServerSideFacetedFilter
            title="Species"
            paramKey="species"
            options={speciesOptions}
          />
          <ServerSideFacetedFilter
            title="Capacity"
            paramKey="capacity"
            options={FosterCapacityOptions}
          />
        </>
      }
    />
  );
};

export default FostersTableToolbar;
