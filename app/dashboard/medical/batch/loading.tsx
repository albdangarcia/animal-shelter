import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MEDICAL_BATCH_DESCRIPTION,
  MEDICAL_BATCH_TITLE,
} from "@/components/dashboard/medical/medical-batch";

const Loading = () => {
  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">{MEDICAL_BATCH_TITLE}</CardTitle>
        <CardDescription>{MEDICAL_BATCH_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* The animal checklist, a group with two units */}
        <div className="space-y-4">
          <div className="flex justify-between gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-8 w-40" />
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="space-y-3 rounded-lg border p-4">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2 border-t pt-3">
                <Skeleton className="h-4 w-20" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* The care form */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="ml-auto h-9 w-40" />
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;
