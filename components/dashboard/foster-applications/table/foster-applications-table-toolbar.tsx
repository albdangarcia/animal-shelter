"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import { FosterApplicationStatuses } from "./foster-applications-options";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { FosterApplicationListItem } from "@/app/lib/data/fosters/foster-applications.data";

interface FosterApplicationsTableToolbarProps {
  table: Table<StockFeatures, FosterApplicationListItem>;
}

const FosterApplicationsTableToolbar = ({
  table,
}: FosterApplicationsTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="foster-applications-search"
      searchPlaceholder="Filter by applicant name..."
      filterParamKeys={["status"]}
      filters={
        <ServerSideFacetedFilter
          title="Status"
          paramKey="status"
          options={FosterApplicationStatuses}
        />
      }
    />
  );
};

export default FosterApplicationsTableToolbar;
