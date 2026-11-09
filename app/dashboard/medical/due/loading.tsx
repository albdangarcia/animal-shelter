import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MEDICAL_DUE_DESCRIPTION,
  MEDICAL_DUE_TITLE,
} from "@/components/dashboard/medical/medical-due";

const Loading = () => {
  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">{MEDICAL_DUE_TITLE}</CardTitle>
        <CardDescription>{MEDICAL_DUE_DESCRIPTION}</CardDescription>
        {/* Kind filter */}
        <Skeleton className="mt-4 h-8 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        {/* Groups, each with a section of rows */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-48" />
            </div>
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="rounded-lg border p-3">
                <div className="flex justify-between gap-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="mt-2 h-4 w-32" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default Loading;
