import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DOSE_SHEET_DESCRIPTION,
  DOSE_SHEET_TITLE,
} from "@/components/dashboard/medical/dose-sheet";

const Loading = () => {
  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">{DOSE_SHEET_TITLE}</CardTitle>
        <CardDescription>{DOSE_SHEET_DESCRIPTION}</CardDescription>
        {/* The day and the days either side */}
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        {/* Slots, each with a place and its rows */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4">
            <Skeleton className="h-6 w-32" />
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="rounded-lg border p-3">
                  <div className="flex justify-between gap-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="mt-2 h-4 w-48" />
                  <Skeleton className="mt-3 h-8 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default Loading;
