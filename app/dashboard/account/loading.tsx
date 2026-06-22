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
    <main className="space-y-8">
      {/* Person form card */}
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-10">
          <div className="space-y-6">
            {/* "Contact Information" section heading */}
            <Skeleton className="h-5 w-44 border-b pb-2" />
            <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
              <FieldSkeleton className="md:col-span-4" />
              <FieldSkeleton className="md:col-span-3" />
              <FieldSkeleton className="md:col-span-3" />
              <FieldSkeleton className="md:col-span-full" />
              <FieldSkeleton className="md:col-span-2" />
              <FieldSkeleton className="md:col-span-2" />
              <FieldSkeleton className="md:col-span-2" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-36" />
        </CardFooter>
      </Card>

      {/* Household form card */}
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </CardHeader>
        <CardContent className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            {/* Two full-width textareas */}
            <div className="md:col-span-full">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div className="md:col-span-full">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-4">
          <Skeleton className="h-10 w-44" />
        </CardFooter>
      </Card>
    </main>
  );
};

export default Loading;