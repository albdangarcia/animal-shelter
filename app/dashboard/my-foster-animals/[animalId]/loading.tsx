import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-4" aria-label="Loading medical care">
    <Skeleton className="h-8 w-64" />
    {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-40 w-full" />)}
  </div>;
}
