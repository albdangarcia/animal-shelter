"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import type { RowData, StockFeatures, Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTableViewOptions } from "@/components/table-common/data-table-view-options";

interface DataTableToolbarProps<TData extends RowData> {
  table: Table<StockFeatures, TData>;
  /**
   * Omit both to drop the search box entirely (e.g. a table whose only
   * searchable text lives in a joined query and can't be pushed into the
   * paginated `where`). When omitted, the toolbar is filters + view options.
   */
  searchPlaceholder?: string;
  searchId?: string;
  /** param keys (besides "query") that count toward "isFiltered" */
  filterParamKeys?: string[];
  /** the filter controls specific to this table */
  filters?: React.ReactNode;
  extraActions?: React.ReactNode;
}

export function DataTableToolbar<TData extends RowData>({
  table,
  searchPlaceholder,
  searchId,
  filterParamKeys = [],
  filters,
  extraActions,
}: DataTableToolbarProps<TData>) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    if (term) {
      params.set("query", term);
    } else {
      params.delete("query");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, 300);

  const currentQuery = searchParams.get("query")?.toString() ?? "";

  const isFiltered =
    searchParams.has("query") ||
    filterParamKeys.some((key) => searchParams.has(key));

  const showSearch = Boolean(searchId);

  return (
    <div className="@container/toolbar flex items-center justify-between">
      <div
        className={
          showSearch
            ? "grid grid-cols-1 items-center gap-y-2 @[736px]/toolbar:grid-cols-[200px_1fr] @[736px]/toolbar:gap-x-4"
            : "flex items-center"
        }
      >
        {showSearch && (
          <div>
            <Input
              // Keying on the URL query remounts the uncontrolled input when the
              // param changes externally (e.g. Reset), keeping the visible text in
              // sync with the URL. Typing doesn't remount: the debounced handler
              // sets query to exactly what was typed.
              key={currentQuery}
              id={searchId}
              placeholder={searchPlaceholder}
              onChange={(e) => handleSearch(e.target.value)}
              defaultValue={currentQuery}
              className="h-8 w-50 @[736px]/toolbar:w-full"
            />
          </div>
        )}
        <div className="space-x-2 @[736px]/toolbar:justify-self-start items-center flex">
          {filters}
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => router.push(pathname)}
              className="h-8 px-2 lg:px-3"
            >
              Reset
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex self-start gap-2">
        <DataTableViewOptions table={table} />
        {extraActions}
      </div>
    </div>
  );
}
