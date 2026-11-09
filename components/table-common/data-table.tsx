"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ColumnDef,
  SortingState,
  ColumnVisibilityState,
  RowData,
  Table,
  StockFeatures,
} from "@tanstack/react-table";
import { stockFeatures, useTable } from "@tanstack/react-table";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/table-common/data-table-pagination";
import { renderColumnPart } from "@/components/table-common/render-column-part";

type TableRecord = RowData & { id: string };

interface DataTableProps<TData extends TableRecord, TExtra = Record<string, never>> {
  columns?: ColumnDef<StockFeatures, TData>[];
  getColumns?: (props: TExtra) => ColumnDef<StockFeatures, TData>[];
  columnProps?: TExtra;
  data: TData[];
  ToolbarComponent?: React.ComponentType<{ table: Table<StockFeatures, TData> } & TExtra>;
  toolbarProps?: TExtra;
  totalPages: number;
  totalRows: number;
}

const DataTable = <TData extends TableRecord, TExtra = Record<string, never>>({
  columns: staticColumns,
  getColumns,
  columnProps,
  data,
  ToolbarComponent,
  toolbarProps,
  totalPages,
  totalRows,
}: DataTableProps<TData, TExtra>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = searchParams.get("sort");
  const [sortId, sortDir] = sort?.split(".") ?? [];
  const sorting: SortingState = sort ? [{ id: sortId, desc: sortDir === "desc" }] : [];

  const columns = getColumns ? getColumns(columnProps as TExtra) : staticColumns ?? [];

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({});

  const table = useTable<StockFeatures, TData>({
    features: stockFeatures,
    data,
    columns,
    // By record, not by position: a row's menu keeps its state (an open
    // dialog, a form's values) across a refresh, so it must stay with its
    // record when the rows reorder.
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      const params = new URLSearchParams(searchParams);

      if (newSorting.length === 0) {
        params.delete("sort");
      } else {
        const sort = newSorting[0];
        params.set("sort", `${sort.id}.${sort.desc ? "desc" : "asc"}`);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: true,
  });

  return (
    <div className="space-y-4">
      {ToolbarComponent && (
        <ToolbarComponent table={table} {...(toolbarProps as TExtra)} />
      )}

      <div className="rounded-md border">
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : renderColumnPart(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {renderColumnPart(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>
      <DataTablePagination table={table} totalPages={totalPages} totalRows={totalRows} />
    </div>
  );
};

export default DataTable;
