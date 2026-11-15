import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HEADCOUNT_GRID_CLASS } from "@/components/dashboard/home/headcount-grid";

const HeadcountCardsSkeleton = () => {
  return (
    <div className={HEADCOUNT_GRID_CLASS}>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            {/* Title */}
            <Skeleton className="h-4 w-24" />
            {/* Big number */}
            <Skeleton className="mt-1 h-8 w-20" />
            {/* Sub-line */}
            <Skeleton className="h-4 w-44" />
          </CardHeader>
          <CardFooter className="mt-auto">
            {/* Link */}
            <Skeleton className="h-4 w-36" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default HeadcountCardsSkeleton;
