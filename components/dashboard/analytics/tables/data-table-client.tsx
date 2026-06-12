"use client";

/**
 * Client-side DataTable.
 *
 * Use this for tables that do NOT need URL-driven server pagination —
 * sorting, filtering, and pagination are all handled locally via
 * @tanstack/react-table's built-in row models.
 *
 * For tables backed by server-side pagination (manualPagination + URL
 * search params), use `data-table.tsx` instead.
 */

import * as React from "react";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  Table,
} from "@tanstack/react-table";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue, TExtra = {}> {
  columns?: ColumnDef<TData, TValue>[];
  getColumns?: (props: TExtra) => ColumnDef<TData, TValue>[];
  columnProps?: TExtra;
  data: TData[];
  ToolbarComponent?: React.ComponentType<{ table: Table<TData> } & TExtra>;
  toolbarProps?: TExtra;
}

const DataTable = <TData, TValue, TExtra = {}>({
  columns: staticColumns,
  getColumns,
  columnProps,
  data,
  ToolbarComponent,
  toolbarProps,
}: DataTableProps<TData, TValue, TExtra>) => {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const columns = React.useMemo(() => {
    if (getColumns) return getColumns(columnProps as TExtra);
    return staticColumns ?? [];
  }, [getColumns, columnProps, staticColumns]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
                      : flexRender(
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
                      {flexRender(
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
    </div>
  );
};

export default DataTable;