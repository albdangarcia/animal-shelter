import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Skeleton className="h-4 w-48" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="@container/card h-full">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-8 w-20" />
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <div className="px-6 pb-6">
          <Skeleton className="h-[250px] w-full" />
        </div>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <div className="flex flex-col gap-3 px-6 pb-6">
          {Array.from({ length: 6 }).map((_, j) => (
            <Skeleton key={j} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Loading;
