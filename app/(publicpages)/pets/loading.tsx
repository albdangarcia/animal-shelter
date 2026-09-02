import { Skeleton } from "@/components/ui/skeleton";
import PetCardSkeleton from "@/components/public-pages/pets/pet-card-skeleton";

const Loading = () => {
  const cards = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-10 sm:px-8 sm:py-14 lg:px-14">
      {/* Header — same type and container as the real page, so the heading
          doesn't move when the data lands. */}
      <div className="space-y-1">
        <h1 className="font-display text-[clamp(38px,6vw,56px)]">Pet List</h1>
        <div className="text-sm text-muted-foreground">
          Currently available for adoption
        </div>
      </div>

      {/* Search + filter controls */}
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="w-full min-w-0 sm:w-96">
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
