import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <main className="container mx-auto">
      <Skeleton className="mb-4 h-9 w-40" />

      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default Loading;
