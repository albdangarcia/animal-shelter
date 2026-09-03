import Link from "next/link";
import { Suspense } from "react";
import PetCard from "@/components/public-pages/pets/pet-card";
import LatestPetsSkeleton from "@/components/public-pages/latest-pets-skeleton";
import SpotlightHero from "@/components/public-pages/home/spotlight-hero";
import SpeciesPills from "@/components/public-pages/home/species-pills";
import HelpPanel from "@/components/public-pages/home/help-panel";
import { getCachedSession } from "@/app/lib/auth/session";
import {
  fetchAvailableAnimalCount,
  fetchLatestPublicAnimals,
  fetchSpecies,
  fetchSpotlightAnimals,
} from "../lib/data/public.data";

/** How many cards the browse strip shows before deferring to /pets. */
const BROWSE_STRIP_COUNT = 10;

const Page = () => (
  <>
    <Suspense fallback={<SpotlightBandFallback />}>
      <SpotlightBand />
    </Suspense>

    <section
      aria-labelledby="browse-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      {/* The pills get their own full-width row rather than sharing one with
          the heading. The mockup's six fit beside a heading; the real
          species list plus "Everyone" does not, and one pill dropping to a
          second line beside the heading reads as a bug rather than a wrap. */}
      <div className="mb-6">
        <div className="mb-5">
          <h2 id="browse-heading" className="mb-1.5 font-display text-[36px]">
            Browse everyone
          </h2>
          <Suspense fallback={<p className="text-[14.5px]">&nbsp;</p>}>
            <BrowseSubline />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <SpeciesPillsContent />
        </Suspense>
      </div>

      <Suspense fallback={<LatestPetsSkeleton />}>
        <LatestPetsContent />
      </Suspense>

      <div className="mt-10 flex justify-center">
        <Link
          href="/pets?page=1"
          className="inline-flex items-center rounded-full border border-border px-[26px] py-3 font-display text-[14px] leading-[1.2] transition-colors hover:bg-foreground/[0.07]"
        >
          View all animals
        </Link>
      </div>
    </section>

    <HelpPanel />
  </>
);

/**
 * The hero band. Renders nothing at all when there is no published animal to
 * feature — an empty accent band with a heading and no content reads as a bug,
 * and the browse strip below already says the list is empty.
 */
const SpotlightBand = async () => {
  const [spotlightAnimals, availableCount, session] = await Promise.all([
    fetchSpotlightAnimals(),
    fetchAvailableAnimalCount(),
    getCachedSession(),
  ]);

  if (spotlightAnimals.length === 0) return null;

  return (
    <SpotlightHero
      animals={spotlightAnimals}
      availableCount={availableCount}
      currentUserPersonId={session?.user?.personId}
    />
  );
};

/**
 * Holds the band's color and roughly its height while the spotlight query
 * resolves, so the nav doesn't sit on a cream page for a beat and then get a
 * band shoved under it.
 */
const SpotlightBandFallback = () => (
  <div
    aria-hidden="true"
    className="h-[560px] w-full bg-organic-accent-100 lg:h-[640px]"
  />
);

const BrowseSubline = async () => {
  const availableCount = await fetchAvailableAnimalCount();

  return (
    <p className="text-[14.5px] text-organic-neutral-700">
      {availableCount} {availableCount === 1 ? "animal" : "animals"}. New
      arrivals appear here as soon as they&apos;re ready to meet people.
    </p>
  );
};

const SpeciesPillsContent = async () => {
  const species = await fetchSpecies();

  return <SpeciesPills speciesNames={species.map(({ name }) => name)} />;
};

const LatestPetsContent = async () => {
  const [latestAnimals, session] = await Promise.all([
    fetchLatestPublicAnimals(BROWSE_STRIP_COUNT),
    getCachedSession(),
  ]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
      {latestAnimals.map((animal) => (
        <PetCard
          key={animal.id}
          pet={animal}
          currentUserPersonId={session?.user?.personId}
        />
      ))}
    </div>
  );
};

export default Page;
