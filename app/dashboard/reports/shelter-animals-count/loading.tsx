import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Skeleton className="h-4 w-48" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-60" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <div className="flex flex-col gap-2 px-6 pb-6">
            {Array.from({ length: 12 }).map((_, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
};

export default Loading;
