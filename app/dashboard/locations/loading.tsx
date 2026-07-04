import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 @xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-2 py-4">
            <CardHeader className="px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <Skeleton className="h-4 w-72" />

      {/* Board + side column */}
      <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_20rem] md:gap-6">
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export default Loading;
