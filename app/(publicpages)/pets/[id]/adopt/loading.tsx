import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const FieldSkeleton = ({ className }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-9 w-full" />
  </div>
);

const RadioSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-4 w-40" />
    <div className="flex items-center space-x-6">
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  </div>
);

const Loading = () => {
  return (
    <main className="max-w-3xl mx-auto pb-10 pt-5">
      <h1 className="text-3xl font-opensans font-medium text-foreground mb-6 text-center">
        Adoption Application
      </h1>

      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Animal Information Header */}
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
        </Card>

        {/* Section 1: Applicant Information */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <Separator />
            <div className="space-y-6">
              <FieldSkeleton />
              <FieldSkeleton />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FieldSkeleton />
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Home & Lifestyle */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FieldSkeleton />
              <FieldSkeleton />
              <RadioSkeleton />
              <RadioSkeleton />
              <RadioSkeleton />
            </div>
            <Separator />
            <div>
              <Skeleton className="h-4 w-28 mb-2" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Experience & Intent */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <Skeleton className="h-4 w-36 mb-2" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    </main>
  );
};

export default Loading;