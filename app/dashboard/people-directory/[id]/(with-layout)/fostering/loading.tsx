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
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">
              <Skeleton className="h-5 w-40" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-64" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Loading;
