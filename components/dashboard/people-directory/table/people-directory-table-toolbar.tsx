"use client";

import { Table } from "@tanstack/react-table";
import { PeopleDirectoryPayload } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { AccountStatuses } from "./people-directory-options";

interface PeopleTableToolbarProps {
  table: Table<PeopleDirectoryPayload>;
}

const PeopleTableToolbar = ({ table }: PeopleTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="people-search"
      searchPlaceholder="Filter by name, email, or phone..."
      filterParamKeys={["account"]}
      filters={
        <ServerSideFacetedFilter
          title="Account"
          paramKey="account"
          options={AccountStatuses}
        />
      }
    />
  );
};

export default PeopleTableToolbar;