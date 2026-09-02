import PetCardSkeleton from "./pets/pet-card-skeleton";

const LatestPetsSkeleton = () => {
  // Number of placeholder cards
  const cards = [0, 1, 2, 3, 4];

  return (
    <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
      {cards.map((card) => (
        <PetCardSkeleton key={card} />
      ))}
    </div>
  );
};

export default LatestPetsSkeleton;
