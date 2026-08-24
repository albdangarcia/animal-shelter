import { fetchFavoritePets } from "@/app/lib/data/public.data";
import { getCachedSession } from "@/app/lib/auth/session";
import PetCard from "../pet-card";

const FavoritesGrid = async () => {
  const session = await getCachedSession();
  const currentUserPersonId = session?.user?.personId;

  const { pets } = await fetchFavoritePets();

  if (pets.length === 0) {
    return (
      <div className="text-center text-muted-foreground mt-10">
        <p>You haven&apos;t liked any pets yet.</p>
        <p className="text-sm mt-1">
          Tap the heart on a pet to save it here.
        </p>
      </div>
    );
  }

  const hasUnavailable = pets.some((pet) => !pet.isAvailable);

  return (
    <>
      <div className="my-6 mb-12 grid gap-4 gap-y-14 grid-cols-[repeat(auto-fill,minmax(--spacing(40),1fr))]">
        {pets.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            currentUserPersonId={currentUserPersonId}
            isAvailable={pet.isAvailable}
          />
        ))}
      </div>

      {hasUnavailable && (
        <p className="text-center text-xs text-muted-foreground mb-8">
          Greyed-out pets are no longer available. You can remove them by tapping
          the heart.
        </p>
      )}
    </>
  );
};

export default FavoritesGrid;