import { Skeleton } from "@/components/ui/skeleton";
import PetCardSkeleton from "@/components/public-pages/pets/pet-card-skeleton";

const Loading = () => {
  const cards = [0, 1, 2, 3, 4, 5, 6, 7];
  const pills = [64, 52, 48, 68, 74];

  return (
    <>
      {/* Band — same surface, container and type as the real header, so the
          heading doesn't move when the data lands. */}
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
          <h1 className="mb-4 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
            All animals
          </h1>
          {/* The count line is Suspended on the real page too — this reserves
              the same single row of 15px text. */}
          <div className="h-[22px]" />
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-14">
        {/* Species pills */}
        <div className="flex gap-2.5 overflow-hidden pb-1">
          {pills.map((width, index) => (
            <Skeleton
              key={index}
              className="h-[37px] shrink-0 rounded-full"
              style={{ width }}
            />
          ))}
        </div>

        {/* Search + refinements */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
          <div className="w-full min-w-0 lg:w-auto lg:max-w-sm lg:flex-1">
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-22 rounded-full" />
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
        </div>

        {/* Pet grid */}
        <div className="my-6 mb-12 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {cards.map((card) => (
            <PetCardSkeleton key={card} />
          ))}
        </div>
      </div>
    </>
  );
};

export default Loading;
