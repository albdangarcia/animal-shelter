"use client";

import { Table } from "@tanstack/react-table";
import { PartnersDirectoryPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { PartnerTypesOptions, ActiveStatusesOptions } from "./partners-directory-options";

interface PartnersTableToolbarProps {
  table: Table<PartnersDirectoryPayload>;
}

const PartnersTableToolbar = ({ table }: PartnersTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="partners-search"
      searchPlaceholder="Filter by name, email, or city..."
      filterParamKeys={["type", "status"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Type"
            paramKey="type"
            options={PartnerTypesOptions}
          />
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={ActiveStatusesOptions}
          />
        </>
      }
    />
  );
};

export default PartnersTableToolbar;