import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ApplicationsWaitingCardSkeleton = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Applications waiting</CardTitle>
        {/* Description */}
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* Adoption and foster lines */}
        {[0, 1].map((row) => (
          <Skeleton key={row} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  );
};

export default ApplicationsWaitingCardSkeleton;
