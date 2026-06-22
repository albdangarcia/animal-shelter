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
        <CardTitle className="@[650px]/card:text-xl">
          Animal Assessments
        </CardTitle>
        <CardDescription>
          A log of all behavioral and medical evaluations.
        </CardDescription>

        {/* Create Assessment button (CardAction sits top-right) */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-40" />
        </div>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="w-full">
          {/* Placeholder accordion rows */}
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex w-full items-center justify-between border-b py-4"
            >
              {/* Trigger content: type, date, assessor, outcome badge */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              {/* Actions menu */}
              <Skeleton className="h-8 w-8 rounded-md" />
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
