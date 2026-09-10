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
        <CardTitle className="@[650px]/card:text-xl">Assessments</CardTitle>
        <CardDescription>
          Structured checks recorded against this animal, newest first.
        </CardDescription>

        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-40" />
        </div>

        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="w-full">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex w-full items-center justify-between border-b py-4"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
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
