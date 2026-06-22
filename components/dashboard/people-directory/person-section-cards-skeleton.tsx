import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PersonSectionCardsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
      {/* Primary Card — Person Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Avatar + contact info */}
          <div className="flex gap-4">
            <Skeleton className="h-28 w-28 shrink-0 rounded-lg" />
            <div className="flex-1 grid grid-cols-1 gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2 p-2.5">
                  <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats grid */}
          <div className="grid grid-cols-2 gap-3 border-t pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="mt-2 h-7 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Secondary Card — Contact & Account Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Address section */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-2"
                >
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>

          {/* Account Information section */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-2"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PersonSectionCardsSkeleton;
