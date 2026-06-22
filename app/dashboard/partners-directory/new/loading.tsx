import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// A single labeled field: label on top, input below.
const FieldSkeleton = ({ className }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-9 w-full" />
  </div>
);

const Loading = () => {
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="space-y-2">
        {/* Title + description */}
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80" />
      </CardHeader>
      <CardContent className="space-y-10">
        {/* Organization Details section */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-48 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
            <FieldSkeleton className="md:col-span-4" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-full" />
            <FieldSkeleton className="md:col-span-full" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
          </div>
        </div>

        {/* Status & Notes section */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-32 border-b pb-2" />
          <div className="space-y-8">
            {/* Active partner checkbox row */}
            <div className="flex items-start gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            {/* Notes textarea */}
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-3 w-72 mt-2" />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-4">
        {/* Cancel + Submit buttons */}
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-36" />
      </CardFooter>
    </Card>
  );
};

export default Loading;