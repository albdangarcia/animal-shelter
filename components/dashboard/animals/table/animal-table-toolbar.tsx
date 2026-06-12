"use client";

import { Table } from "@tanstack/react-table";
import { sexOptions } from "./animal-options";
import { animalListingStatusOptions } from "@/app/lib/utils/enum-formatter";
import { AnimalsPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";

interface AnimalsDataTableToolbarProps {
  table: Table<AnimalsPayload>;
}

const AnimalsDataTableToolbar = ({ table }: AnimalsDataTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="animal-search"
      searchPlaceholder="Filter Animals..."
      filterParamKeys={["listingStatus", "sex"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Status"
            paramKey="listingStatus"
            options={animalListingStatusOptions}
          />
          <ServerSideFacetedFilter
            title="Sex"
            paramKey="sex"
            options={sexOptions}
          />
        </>
      }
    />
  );
};

export default AnimalsDataTableToolbar;