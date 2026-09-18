/**
 * Loading shape for SpotlightHero. Mirrors its layout — portrait circle, tag
 * pill, name, meta line, description block, button row, and the flick-through
 * thumbnails — so a slow spotlight query (e.g. on client-side nav back to the
 * homepage) doesn't leave the band blank for several seconds. Sage/neutral
 * pieces of the real band (the decorative circles, thumbnail placeholders)
 * are skipped; only what's replaced by real content on arrival is shaped.
 */
const SpotlightHeroSkeleton = () => (
  <section
    aria-hidden="true"
    className="relative h-[560px] overflow-hidden bg-organic-accent-100 lg:h-[640px]"
  >
    <div className="relative mx-auto w-full max-w-6xl px-5 pt-6 pb-8 sm:px-8 lg:px-14">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_470px] lg:gap-12">
        {/* Portrait */}
        <div className="order-first lg:order-last lg:justify-self-end">
          <div className="relative mx-auto w-[min(72vw,320px)] sm:w-[min(60vw,380px)] lg:w-[440px]">
            <div className="aspect-square animate-pulse rounded-full bg-organic-accent-200" />
          </div>
        </div>

        {/* Text column */}
        <div>
          <div className="mb-5 h-[27px] w-[220px] animate-pulse rounded-full bg-organic-accent-200" />

          <div className="mb-2.5 h-[72px] w-[70%] animate-pulse rounded-2xl bg-organic-accent-200" />

          <div className="mb-[18px] h-[30px] w-[80%] animate-pulse rounded-[10px] bg-organic-accent-200" />

          <div className="mb-7 min-h-[87px] max-w-[46ch] space-y-2.5">
            <div className="h-[17px] w-full animate-pulse rounded-full bg-organic-accent-200" />
            <div className="h-[17px] w-full animate-pulse rounded-full bg-organic-accent-200" />
            <div className="h-[17px] w-2/3 animate-pulse rounded-full bg-organic-accent-200" />
          </div>

          <div className="flex flex-wrap items-center gap-3.5">
            <div className="h-[45px] w-[150px] animate-pulse rounded-full bg-organic-accent-200" />
            <div className="h-[45px] w-[190px] animate-pulse rounded-full bg-organic-accent-200" />
          </div>
        </div>
      </div>

      {/* Flick-through row. The "Or flick through" label's slot (75x34px,
          measured) is reserved so the thumbnails land at the same x as the
          real row instead of sitting flush against the edge. */}
      <div className="mt-10 flex items-center gap-[26px]">
        <div className="h-[34px] w-[75px] shrink-0" />
        {[0, 1, 2, 3, 4].map((thumbnail) => (
          <div
            key={thumbnail}
            className="size-[78px] shrink-0 animate-pulse rounded-full bg-organic-accent-200"
          />
        ))}
      </div>
    </div>
  </section>
);

export default SpotlightHeroSkeleton;
