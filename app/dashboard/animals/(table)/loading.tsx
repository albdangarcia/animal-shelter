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
          Animals
        </CardTitle>
        <CardDescription>
          Manage all animals currently in your care or begin the intake process
          for a new arrival.
        </CardDescription>
        {/* Add Animal button (CardAction sits top-right) */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-28" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTableSkeleton columnCount={7} rowCount={8} filterCount={2} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;