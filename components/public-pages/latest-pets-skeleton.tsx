import { Skeleton } from "@/components/ui/skeleton";

const LatestPetsSkeleton = () => {
  // Number of placeholder cards
  const cards = [0, 1, 2, 3, 4];

  return (
    <div className="mt-6 grid gap-4 gap-y-14 grid-cols-[repeat(auto-fit,minmax(--spacing(40),1fr))]">
      {cards.map((card) => (
        <div key={card} className="relative max-w-56 block rounded-lg">
          {/* Image */}
          <Skeleton className="w-full aspect-square rounded-lg" />

          {/* Overlapping info panel */}
          <div className="absolute -bottom-6.5 left-2 right-2">
            <div className="flex flex-col px-4 py-2 bg-card shadow-lg rounded-lg relative">
              {/* Name */}
              <Skeleton className="h-4 w-24" />
              {/* Age • city */}
              <Skeleton className="h-3 w-32 mt-1.5" />
              {/* Like button */}
              <div className="absolute -top-4 right-2 z-10">
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LatestPetsSkeleton;