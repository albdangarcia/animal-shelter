import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const UnderCareCardSkeleton = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Under care</CardTitle>
        {/* Total */}
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Count by type */}
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-4 w-full" />
          ))}
        </div>
        {/* Latest */}
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UnderCareCardSkeleton;
