import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FieldSkeleton = ({ className }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-9 w-full" />
  </div>
);

const TextareaSkeleton = ({ className }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-20 w-full" />
  </div>
);

const Loading = () => {
  return (
    <Card className="w-full max-w-3xl mx-auto @container/card">
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>

      <CardContent className="space-y-10">
        {/* Section 1 — Applicant Information */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-48 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
            <FieldSkeleton className="md:col-span-4" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-full" />
            <FieldSkeleton className="md:col-span-full" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
          </div>
        </div>

        {/* Section 2 — Household & Lifestyle */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-48 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-3" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            <FieldSkeleton className="md:col-span-2" />
            <TextareaSkeleton className="md:col-span-full" />
            <TextareaSkeleton className="md:col-span-full" />
          </div>
        </div>

        {/* Section 3 — Application Details */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-44 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
            <TextareaSkeleton className="md:col-span-full" />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end space-x-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-40" />
      </CardFooter>
    </Card>
  );
};

export default Loading;
