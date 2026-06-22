import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="my-6 mb-12 grid gap-4 gap-y-14 grid-cols-[repeat(auto-fit,minmax(--spacing(40),1fr))]">
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
    </div>
  );
};

export default Loading;