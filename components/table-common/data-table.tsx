"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
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
import { DataTablePagination } from "@/components/table-common/data-table-pagination";

interface DataTableProps<TData, TValue, TExtra = {}> {
  columns?: ColumnDef<TData, TValue>[];
  getColumns?: (props: TExtra) => ColumnDef<TData, TValue>[];
  columnProps?: TExtra;
  data: TData[];
  ToolbarComponent?: React.ComponentType<{ table: Table<TData> } & TExtra>;
  toolbarProps?: TExtra;
  totalPages: number;
  totalRows: number;
}

const DataTable = <TData, TValue, TExtra = {}>({
  columns: staticColumns,
  getColumns,
  columnProps,
  data,
  ToolbarComponent,
  toolbarProps,
  totalPages,
  totalRows,
}: DataTableProps<TData, TValue, TExtra>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sorting: SortingState = React.useMemo(() => {
    const sort = searchParams.get("sort");
    if (!sort) return [];
    const [id, dir] = sort.split(".");
    return [{ id, desc: dir === "desc" }];
  }, [searchParams]);

  const columns = React.useMemo(() => {
    if (getColumns) return getColumns(columnProps as TExtra);
    return staticColumns ?? [];
  }, [getColumns, columnProps, staticColumns]);

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
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
    getCoreRowModel: getCoreRowModel(),
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
      <DataTablePagination table={table} totalPages={totalPages} totalRows={totalRows} />
    </div>
  );
};

export default DataTable;