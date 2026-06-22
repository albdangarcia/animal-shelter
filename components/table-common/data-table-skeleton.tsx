import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
  /** show the search + filters + view-options row */
  showToolbar?: boolean;
  /** show the pagination row */
  showPagination?: boolean;
  /** number of placeholder filter buttons next to the search input */
  filterCount?: number;
}

export function DataTableSkeleton({
  columnCount = 6,
  rowCount = 8,
  showToolbar = true,
  showPagination = true,
  filterCount = 1,
}: DataTableSkeletonProps) {
  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex items-center justify-between">
          {/* Search + filters (left) */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-50" />
            {Array.from({ length: filterCount }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
          {/* View options (right) */}
          <Skeleton className="h-8 w-20" />
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columnCount }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-5 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columnCount }).map((_, colIndex) => (
                  <TableCell key={colIndex}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between">
          {/* "X of Y selected" text */}
          <Skeleton className="h-8 w-32" />
          {/* Page controls */}
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      )}
    </div>
  );
}