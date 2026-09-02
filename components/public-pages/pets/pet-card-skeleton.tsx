import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors PetCard's shape: photo block, name + age row, tag pills, then the
 * full-width "Meet" button. Kept in step with the card — a skeleton that models
 * a different layout shows as a jump when the real cards arrive.
 */
const PetCardSkeleton = () => (
  <div className="flex flex-col gap-[10px] rounded-[32px] bg-card p-[14px]">
    {/* Photo */}
    <Skeleton className="h-[210px] w-full rounded-[20px]" />

    {/* Name + age */}
    <div className="flex items-baseline justify-between gap-2">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-3 w-14" />
    </div>

    {/* Tags */}
    <div className="flex flex-wrap gap-1.5">
      <Skeleton className="h-[19px] w-20 rounded-full" />
      <Skeleton className="h-[19px] w-14 rounded-full" />
      <Skeleton className="h-[19px] w-16 rounded-full" />
    </div>

    {/* "Meet {name}" button */}
    <Skeleton className="mt-auto h-10 w-full rounded-full" />
  </div>
);

export default PetCardSkeleton;
