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
        <CardTitle className="@[650px]/card:text-xl">Animal Notes</CardTitle>
        <CardDescription>
          Keep track of important notes about this animal.
        </CardDescription>

        {/* Add Note button (CardAction sits top-right) */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-24" />
        </div>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Placeholder note cards */}
          {[0, 1, 2].map((note) => (
            <div key={note} className="border rounded-lg p-4">
              {/* Category badge */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              {/* Note content — two lines */}
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              {/* Author + timestamp */}
              <Skeleton className="h-3 w-48 mt-3" />
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        {/* Pagination */}
        <Skeleton className="h-8 w-64" />
      </CardFooter>
    </Card>
  );
};

export default Loading;
