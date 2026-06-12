import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Loading() {
  // Define the number of columns and rows for the skeleton
  const columnCount = 10;
  const rowCount = 8;

  return (
    <Card>
      <CardHeader>
        {/* Card Title Skeleton */}
        <Skeleton className="h-7 w-24" />
        {/* Card Description Skeleton */}
        <Skeleton className="mt-2 h-4 w-full max-w-sm" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Toolbar Skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-28" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>

          {/* Table Skeleton */}
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
                {Array.from({ length: rowCount }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: columnCount }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Skeleton */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}