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
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          My foster animals
        </CardTitle>
        <CardDescription>
          Animals currently placed with you as a foster.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 @2xl/card:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
};

export default Loading;
