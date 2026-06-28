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
        <div className="space-y-4">
          <Skeleton className="h-5 w-24 border-b pb-2" />
          <Skeleton className="h-8 w-48" />
        </div>

        <div className="space-y-6">
          <Skeleton className="h-5 w-48 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <FieldSkeleton />
          <FieldSkeleton />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </div>

        <div className="space-y-6">
          <Skeleton className="h-5 w-40 border-b pb-2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <TextareaSkeleton />
        </div>

        <div className="space-y-6">
          <Skeleton className="h-5 w-44 border-b pb-2" />
          <TextareaSkeleton />
          <TextareaSkeleton />
        </div>
      </CardContent>

      <CardFooter className="flex justify-end space-x-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-36" />
      </CardFooter>
    </Card>
  );
};

export default Loading;
