import PetCardSkeleton from "./pets/pet-card-skeleton";

const LatestPetsSkeleton = () => {
  // One per card the browse strip renders, so the grid doesn't reflow when the
  // real cards land.
  const cards = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
      {cards.map((card) => (
        <PetCardSkeleton key={card} />
      ))}
    </div>
  );
};

export default LatestPetsSkeleton;
