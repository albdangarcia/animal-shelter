"use client";

import type { RowData, StockFeatures, Table } from "@tanstack/react-table";
import { DataTableViewOptions } from "@/components/table-common/data-table-view-options";

interface DataTableViewToolbarProps<TData extends RowData> {
  table: Table<StockFeatures, TData>;
}

export function DataTableViewToolbarClient<TData extends RowData>({
  table,
}: DataTableViewToolbarProps<TData>) {
  return (
    <div className="@container/toolbar flex items-center justify-between">
      <div className="flex self-start gap-2">
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
