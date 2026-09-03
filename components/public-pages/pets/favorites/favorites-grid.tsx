import Link from "next/link";
import { fetchFavoritePets } from "@/app/lib/data/public.data";
import { getCachedSession } from "@/app/lib/auth/session";
import PetCard from "../pet-card";

const FavoritesGrid = async () => {
  const session = await getCachedSession();
  const currentUserPersonId = session?.user?.personId;

  const { pets } = await fetchFavoritePets();

  if (pets.length === 0) {
    return <EmptyState />;
  }

  const hasUnavailable = pets.some((pet) => !pet.isAvailable);

  return (
    <>
      <div className="mb-12 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
        {pets.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            currentUserPersonId={currentUserPersonId}
            isAvailable={pet.isAvailable}
          />
        ))}
      </div>

      {/* Attached to the grid by a hairline rather than floating under it as
          small centred muted text, which read as a disclaimer nobody wrote on
          purpose. Contact's directory is the reference: a rule carries
          the structure, no card and no shadow. */}
      {hasUnavailable && (
        // The rule spans the grid it belongs to; the text inside it keeps a
        // reading measure. A hairline cut to 60ch would stop mid-grid and read
        // as an accident rather than a division.
        <div className="mb-8 border-t border-border pt-5">
          <p className="max-w-[60ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
            The greyed-out animals have been adopted or are no longer listed.
            They&apos;re kept here so you can see what happened to them — tap
            the heart on one to remove it.
          </p>
        </div>
      )}
    </>
  );
};

/**
 * Signed in with nothing saved. A designed state matching /pets's empty state
 * and the signed-out state on this page.
 *
 * This is the only place the heart interaction is ever explained, so the
 * sentence names the mechanism rather than just reporting the absence.
 */
const EmptyState = () => (
  <div className="py-20 text-center">
    <h2 className="font-display text-[clamp(24px,4vw,32px)]">
      Nothing saved yet
    </h2>
    <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
      Tap the heart on any animal to save them here, so you can think it over
      and come back without hunting for them again.
    </p>

    <Link
      href="/pets"
      className="mt-7 inline-flex rounded-full bg-primary px-[26px] py-[13px] text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-organic-accent-600"
    >
      Browse all animals
    </Link>
  </div>
);

export default FavoritesGrid;
