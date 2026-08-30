"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import type { AiActivityLogRow } from "@/app/lib/data/ai-activity.data";
import type { AiActivityTableExtra } from "./ai-activity-table-columns";
import { aiActivityStates } from "./ai-activity-options";

type Props = { table: Table<StockFeatures, AiActivityLogRow> } & AiActivityTableExtra;

const AiActivityTableToolbar = ({ table, actorOptions }: Props) => {
  return (
    // No search box: the only searchable text (task title) lives in the joined
    // query, not the paginated one — searching it would break pagination.
    <DataTableToolbar
      table={table}
      filterParamKeys={["state", "actor"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="State"
            paramKey="state"
            options={aiActivityStates}
          />
          {actorOptions.length > 0 && (
            <ServerSideFacetedFilter
              title="Actor"
              paramKey="actor"
              options={actorOptions}
            />
          )}
        </>
      }
    />
  );
};

export default AiActivityTableToolbar;
