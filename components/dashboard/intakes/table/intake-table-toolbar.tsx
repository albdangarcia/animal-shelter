"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import { intakeTypeOptions } from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import type { IntakeWithDetails } from "@/app/lib/data/animals/intake.data";

interface IntakeTableToolbarProps {
  table: Table<StockFeatures, IntakeWithDetails>;
}

const IntakeTableToolbar = ({ table }: IntakeTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="intake-search"
      searchPlaceholder="Filter by animal name..."
      filterParamKeys={["type"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Type"
            paramKey="type"
            options={intakeTypeOptions}
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

export default IntakeTableToolbar;
