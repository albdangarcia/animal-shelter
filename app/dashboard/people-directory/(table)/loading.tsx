import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/table-common/data-table-skeleton";

const Loading = () => {
  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle className="@[650px]/card:text-xl">
          People Directory
        </CardTitle>
        <CardDescription>
          View and manage records for adopters, volunteers, and shelter
          contacts.
        </CardDescription>
        {/* Add Person button */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-28" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTableSkeleton columnCount={6} rowCount={8} filterCount={1} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;