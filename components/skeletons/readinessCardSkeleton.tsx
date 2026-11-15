import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ReadinessCardSkeleton = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Readiness</CardTitle>
        {/* "N of M animals ready" */}
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* Ready drafts, published with something outstanding, the groups */}
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  );
};

export default ReadinessCardSkeleton;
