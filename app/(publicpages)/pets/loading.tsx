import { Skeleton } from "@/components/ui/skeleton";
import PetCardSkeleton from "@/components/public-pages/pets/pet-card-skeleton";

const Loading = () => {
  const cards = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-3xl font-medium">Pet List</div>
        <div className="text-sm text-muted-foreground">
          Currently available for adoption
        </div>
      </div>

      {/* Search + category controls */}
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="w-96">
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>

      {/* Pet grid */}
      <div className="my-6 mb-12 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
        {cards.map((card) => (
          <PetCardSkeleton key={card} />
        ))}
      </div>
    </div>
  );
};

export default Loading;