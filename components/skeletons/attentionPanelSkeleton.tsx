import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const AttentionPanelSkeleton = () => {
  return (
    <Card className="@4xl/main:col-span-2">
      <CardHeader>
        <CardTitle>Needs attention today</CardTitle>
        <CardDescription>
          Each item clears when someone acts on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {[0, 1, 2].map((group) => (
          <div key={group} className="flex flex-col gap-2">
            {/* Group heading */}
            <Skeleton className="h-5 w-48" />
            {/* First animals */}
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-4 w-72 max-w-full" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default AttentionPanelSkeleton;
