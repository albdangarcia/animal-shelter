"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTableViewOptions } from "@/components/table-common/data-table-view-options";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchPlaceholder: string;
  searchId: string;
  /** param keys (besides "query") that count toward "isFiltered" */
  filterParamKeys?: string[];
  /** the filter controls specific to this table */
  filters?: React.ReactNode;
  extraActions?: React.ReactNode;
}

export function DataTableToolbar<TData>({
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

  const isFiltered =
    searchParams.has("query") ||
    filterParamKeys.some((key) => searchParams.has(key));

  return (
    <div className="@container/toolbar flex items-center justify-between">
      <div className="grid grid-cols-1 items-center gap-y-2 @[736px]/toolbar:grid-cols-[200px_1fr] @[736px]/toolbar:gap-x-4">
        <div>
          <Input
            id={searchId}
            placeholder={searchPlaceholder}
            onChange={(e) => handleSearch(e.target.value)}
            defaultValue={searchParams.get("query")?.toString()}
            className="h-8 w-50 @[736px]/toolbar:w-full"
          />
        </div>
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