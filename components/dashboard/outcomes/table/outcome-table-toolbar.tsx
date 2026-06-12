"use client";

import { Table } from "@tanstack/react-table";
import { outcomeTypeOptions } from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { OutcomeWithDetails } from "@/app/lib/data/animals/outcome.data";

interface OutcomeTableToolbarProps {
  table: Table<OutcomeWithDetails>;
}

const OutcomeTableToolbar = ({ table }: OutcomeTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="outcome-search"
      searchPlaceholder="Filter Outcomes..."
      filterParamKeys={["type"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Type"
            paramKey="type"
            options={outcomeTypeOptions}
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Select order"
            options={[
              { label: "Newest First", value: "date.desc" },
              { label: "Oldest First", value: "date.asc" },
            ]}
          />
        </>
      }
    />
  );
};

export default OutcomeTableToolbar;