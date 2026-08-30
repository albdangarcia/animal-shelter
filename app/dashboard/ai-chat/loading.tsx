import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="flex h-[calc(100dvh-var(--header-height)-2rem)] min-h-0 flex-col md:h-[calc(100dvh-var(--header-height)-3rem)]">
      <Card className="@container/card flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="@[650px]/card:text-xl">AI Assistant</CardTitle>
          <CardDescription>
            Ask about animals, tasks, and what needs attention today.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-hidden">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Skeleton className="h-8 w-44 rounded-full" />
                <Skeleton className="h-8 w-36 rounded-full" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
            </div>
            <Skeleton className="mx-auto h-14 w-full max-w-3xl shrink-0 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Loading;
