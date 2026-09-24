import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

const FormFieldSkeleton = () => (
  <div className="space-y-2">
    <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
    <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
  </div>
);

export default function Loading() {
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        {/* Card Title Skeleton */}
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        {/* Card Description Skeleton */}
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded-md bg-muted" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>

        {/* Notes Field Skeleton */}
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-4">
        {/* Cancel Button Skeleton */}
        <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
        {/* Submit Button Skeleton */}
        <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
      </CardFooter>
    </Card>
  );
}
