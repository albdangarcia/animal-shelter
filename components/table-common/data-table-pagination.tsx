"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  totalPages: number;
  totalRows: number;
}

export function DataTablePagination<TData>({
  table,
  totalPages,
  totalRows,
}: DataTablePaginationProps<TData>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get("page")) || 1;

  const rawPageSize = Number(searchParams.get("pageSize")) || 10;
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize) ? rawPageSize : 10;

  const handleNavigation = (page?: number, size?: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page ?? currentPage));
    params.set("pageSize", String(size ?? pageSize));
    router.push(`${pathname}?${params.toString()}`);
  };

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const availableSizeOptions = PAGE_SIZE_OPTIONS.filter((_, index) => {
    const previousSize = PAGE_SIZE_OPTIONS[index - 1] ?? 0;
    return previousSize < totalRows;
  });

  // Ensure there's always at least one option to display (e.g. when totalRows is 0)
  const displaySizeOptions =
    availableSizeOptions.length > 0 ? availableSizeOptions : [pageSize];

  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of {totalRows} row(s)
        selected.
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => handleNavigation(1, Number(value))}
            disabled={displaySizeOptions.length <= 1}
          >
            <SelectTrigger className="h-8 w-17.5">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {displaySizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-25 items-center justify-center text-sm font-medium">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => handleNavigation(1)}
            disabled={!canGoPrevious}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handleNavigation(currentPage - 1)}
            disabled={!canGoPrevious}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handleNavigation(currentPage + 1)}
            disabled={!canGoNext}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => handleNavigation(totalPages)}
            disabled={!canGoNext}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
