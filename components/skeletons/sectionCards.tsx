import {
  Card,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SectionCardsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            {/* Description label */}
            <Skeleton className="h-4 w-28" />
            {/* Big number */}
            <Skeleton className="h-8 w-20 mt-1" />
            {/* Trend badge (CardAction, top-right) */}
            <div className="absolute right-6 top-6">
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default SectionCardsSkeleton;