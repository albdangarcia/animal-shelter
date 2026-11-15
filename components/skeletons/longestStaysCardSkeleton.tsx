import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const LongestStaysCardSkeleton = () => {
  return (
    <Card className="@4xl/main:col-span-2">
      <CardHeader>
        <CardTitle>Longest stays</CardTitle>
        {/* "N in care · M over 90 days" */}
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The five longest stays */}
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex justify-between gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </CardContent>
      <CardFooter>
        {/* "Length of stay report" */}
        <Skeleton className="h-4 w-36" />
      </CardFooter>
    </Card>
  );
};

export default LongestStaysCardSkeleton;
