import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle className="@[650px]/card:text-xl">Vitals</CardTitle>
        <CardDescription>
          A dated log of weight, temperature, and body condition.
        </CardDescription>

        {/* Record Vitals button (CardAction sits top-right) */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-32" />
        </div>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="flex gap-6 mt-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        <Skeleton className="h-8 w-64" />
      </CardFooter>
    </Card>
  );
};

export default Loading;
