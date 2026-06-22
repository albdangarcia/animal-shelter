import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 lg:gap-y-0 items-start">
      {/* Gallery (left column) */}
      <div className="flex flex-col gap-y-2">
        {/* Large image */}
        <Skeleton className="w-full h-75 rounded-xl" />
        {/* Thumbnail row */}
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>

      {/* Details (right column) */}
      <div className="flex flex-col space-y-5">
        {/* Name, location, age badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>

        {/* Adoption CTA button */}
        <Skeleton className="h-12 w-full rounded-md" />

        {/* Key facts table */}
        <div className="bg-muted rounded-lg px-4 sm:grid sm:grid-cols-2 sm:gap-x-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-border/70"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>

        {/* About section */}
        <div className="pt-4 border-t space-y-2">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Personality & Needs section */}
        <div className="pt-4 border-t">
          <Skeleton className="h-5 w-44 mb-3" />
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-7 rounded-full"
                style={{ width: `${5 + i}rem` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Loading;