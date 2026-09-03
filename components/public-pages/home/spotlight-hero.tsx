"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { PhotoIcon } from "@heroicons/react/24/outline";
import type { SpotlightAnimal } from "@/app/lib/data/public.data";
import { formatWeight } from "@/app/lib/utils/weight-format";
import LikeButton from "../like-button";

interface SpotlightHeroProps {
  animals: SpotlightAnimal[];
  /** Total PUBLISHED animals — drives the "+N" circle. */
  availableCount: number;
  currentUserPersonId: string | undefined;
}

/**
 * The homepage hero band: one animal shown large, with a row of thumbnails that
 * swap which one that is. Client-side because the swap is local state — picking
 * a different animal must not navigate.
 *
 * Every field on a SpotlightAnimal except `id` and `name` can be null: an
 * animal backfilled into the spotlight (published, but with no open stay) may
 * arrive with no photo, no description, no weight and no badge. That is a
 * normal state, not an error. The description is placeholdered — a fixed
 * three-line slot holds its space so swapping animals doesn't re-centre the
 * text column — but the photo, weight and badge are still omitted rather than
 * placeholdered, being absolutely positioned or block-level so nothing below
 * them shifts when they are absent.
 */
const SpotlightHero = ({
  animals,
  availableCount,
  currentUserPersonId,
}: SpotlightHeroProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Every fetched candidate gets a circle — the hero is always one of them, so
  // the selected ring always has a thumbnail to sit on and nothing is fetched
  // and then discarded.
  // Defensive: a reseed between render and hydration can't change this, but an
  // index past the end would blank the whole band.
  const animal = animals[selectedIndex] ?? animals[0];

  // How many animals the visitor hasn't seen in this row. Hidden at zero rather
  // than rendering "+0".
  const remainingCount = Math.max(availableCount - animals.length, 0);

  // Never assert the negative: an animal that isn't neutered simply drops the
  // word, and an animal with neither flag renders no badge at all.
  const badges = [
    animal.isSpayedNeutered && "Neutered",
    animal.hasMicrochip && "Chipped",
  ].filter((badge): badge is string => Boolean(badge));

  // The mockup's flat 104px is sized for "Sadie". Caprasimo averages ~0.653em
  // per character, so the 522px text column only fits about 8 characters at
  // that size — and the seed's most common name length IS 8. Measured at the
  // design width, "Cinnamon" wants 543px and either breaks mid-word or spills
  // under the portrait.
  //
  // So cap the size by the name's own length as well as the ceiling, against
  // the column (cqw) rather than the viewport: a short name still gets the
  // mockup's exact 104px, a long one steps down instead of overflowing, and
  // past max-w-6xl the column stops growing so wide screens get margins rather
  // than a runaway heading.
  //
  // 0.653em is Caprasimo's average advance, measured off "Cinnamon" — which
  // means it is an average, NOT an upper bound. Per-glyph advances run from
  // 0.356em ("i") to 1.040em ("W"), so a wide-glyph name defeats the estimate:
  // "MAXWELL" is only 7 characters but 572px at 104px in a 522px column. The
  // heading's `break-words` is what catches those — it is load-bearing here,
  // not decorative. Widening the coefficient to cover "W" instead would shrink
  // every ordinary name to pay for a rare one.
  const nameFontSize = `max(32px, min(104px, 100cqw / ${(
    animal.name.length * 0.653
  ).toFixed(2)}))`;

  // Breed · age · weight, matching the mockup's three segments. Species was a
  // fourth until it was measured: at Caprasimo 22px in the 522px text column,
  // "American Eskimo Dog · 11 months · Dog · 99.99 kg" is 552px and wraps, as do
  // the next two longest single-breed combinations. Dropping species brings the
  // worst single-breed line to 492px, 30px inside the column.
  //
  // It does NOT save the two-breed animals the seed produces — breedString joins
  // every breed, so "American Eskimo Dog, Golden Retriever · …" is 695px and
  // wraps either way. Two lines is a graceful wrap rather than an overflow, and
  // the card tags carry species regardless, so the hero does not
  // need to be a spec sheet.
  const meta = [
    animal.breedString,
    animal.ageString,
    formatWeight(animal.weightGrams),
  ].filter((part): part is string => Boolean(part));

  return (
    <section
      aria-labelledby="spotlight-heading"
      className="relative overflow-hidden bg-organic-accent-100"
    >
      {/* Decorative only, and clipped by this section — so neither circle may
          bleed off the TOP edge: the nav is a sibling above, not a parent, and
          a negative top would show as a straight cut across the band. Right and
          bottom bleed are fine (viewport edge, band boundary). Hidden below md,
          where they crowd the text instead of decorating it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[-90px] hidden size-[340px] rounded-full bg-organic-accent-200 md:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-120px] left-[38%] hidden size-[220px] rounded-full bg-organic-sage-200 md:block"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-6 pb-8 sm:px-8 lg:px-14">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_470px] lg:gap-12">
          {/* Portrait — first when stacked, right-hand column on lg */}
          <div className="order-first lg:order-last lg:justify-self-end">
            <div className="relative mx-auto w-[min(72vw,320px)] sm:w-[min(60vw,380px)] lg:w-[440px]">
              {/* Sage disc, offset up and left behind the portrait */}
              <div
                aria-hidden="true"
                className="absolute inset-[-18px_30px_30px_-18px] rounded-full bg-organic-sage-300"
              />

              <div className="relative aspect-square overflow-hidden rounded-full bg-organic-neutral-300 shadow-organic-lg">
                {animal.imageUrl ? (
                  <Image
                    // Remounts on swap. Without it the <img> is reused and the
                    // browser keeps painting the PREVIOUS animal's photo until
                    // the new one decodes — the old face under the new name,
                    // which reads as a bug. A blank disc for a beat is honest.
                    key={animal.id}
                    src={animal.imageUrl}
                    alt={`Photo of ${animal.name}`}
                    fill
                    sizes="(max-width: 640px) 72vw, (max-width: 1024px) 60vw, 440px"
                    // The LCP element — every other image on the page is below
                    // the fold or smaller than this one. `priority` is
                    // deprecated as of Next 16, and `preload` injects a <link>
                    // in <head>, which is wrong for a src that changes on
                    // click; eager + high fetch priority is the replacement.
                    loading="eager"
                    fetchPriority="high"
                    // Biased up from centre: these are full-body shots as often
                    // as head shots, and a square crop of a standing dog puts
                    // the head near the top.
                    className="object-cover object-[50%_30%]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-organic-neutral-300">
                    <PhotoIcon
                      className="size-24 text-organic-neutral-600"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              {badges.length > 0 && (
                <div className="absolute top-[14px] right-[6px] flex items-center gap-2 rounded-full bg-background px-[18px] py-[9px] text-[13px] shadow-organic-md">
                  {badges.map((badge, index) => (
                    <span
                      key={badge}
                      className="inline-flex items-center gap-2"
                    >
                      {index > 0 && (
                        <span
                          aria-hidden="true"
                          className="text-[10px] align-middle"
                        >
                          •
                        </span>
                      )}
                      <span>{badge}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Text column. @container so the name can size itself against this
              column's width rather than the viewport's. */}
          <div className="@container">
            {animal.waitingDays !== null && (
              // The mockup's `.tag.tag-accent-2`: sage-100 on sage-800, pill
              // radius, 20px below. Its 11px is sized for a one-word tag and
              // this is a full sentence, so it takes the 12.5px / 5px 14px
              // the colors and the pill shape are exact.
              <p className="mb-5 inline-flex rounded-full bg-organic-sage-100 px-3.5 py-[5px] text-[12.5px] tracking-[0.02em] text-organic-sage-800">
                Waiting {animal.waitingDays}{" "}
                {animal.waitingDays === 1 ? "day" : "days"} — the longest of
                anyone here
              </p>
            )}

            <h1
              id="spotlight-heading"
              // break-words (overflow-wrap: break-word) is the backstop for
              // any name the character-count estimate under-measures — a
              // wide-glyph or all-caps name wraps to a second line instead of
              // spilling under the portrait. Verified: "MAXWELL" and
              // "MMMMMMMM" both wrap; "Marshmallow" (the longest seeded name)
              // stays on one line at 72.7px.
              className="mb-2.5 font-display leading-[0.94] tracking-[-0.03em] break-words"
              style={{ fontSize: nameFontSize }}
            >
              {animal.name}
            </h1>

            <p className="mb-[18px] flex flex-wrap items-center gap-2.5 font-display text-[22px] leading-[1.55] text-organic-accent-700">
              {meta.map((part, index) => (
                <span key={index} className="inline-flex items-center gap-2.5">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-[12px] align-middle"
                    >
                      •
                    </span>
                  )}
                  <span>{part}</span>
                </span>
              ))}
            </p>

            {/* Fixed three-line slot. The copy varies in length and can be absent, and
                the grid is items-center, so an unreserved block re-centres the whole
                column — the name drops as the buttons rise. min-h and line-clamp must
                agree: 3 x 29px = 87px, which is why the line-height is a whole number
                rather than the 1.65 (28.875px) it started as. */}
            <div className="mb-7 min-h-[87px] max-w-[46ch]">
              {animal.description && (
                <p className="line-clamp-3 text-[17.5px] leading-[29px] text-pretty text-organic-neutral-800">
                  {animal.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3.5">
              <Link
                href={`/pets/${animal.id}`}
                className="inline-flex items-center rounded-full bg-primary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-primary-foreground transition-colors hover:bg-organic-accent-600"
              >
                Meet {animal.name}
              </Link>
              <LikeButton
                // Keyed so the button resets its pending state when the hero
                // swaps to a different animal.
                key={animal.id}
                animalId={animal.id}
                currentUserPersonId={currentUserPersonId}
                isLikedByCurrentUser={animal.isLikedByCurrentUser}
                label="Save to favorites"
              />
            </div>
          </div>
        </div>

        {/* Flick-through row — still inside the accent band */}
        <div className="mt-10 flex items-center gap-[26px]">
          <span
            id="flick-through-label"
            className="max-w-[9ch] shrink-0 text-[13px] leading-[1.3] text-organic-accent-800"
          >
            Or flick through
          </span>

          {/* Scrolls horizontally on narrow screens rather than wrapping or
              shrinking the circles below a comfortable tap target. */}
          <div
            role="group"
            aria-labelledby="flick-through-label"
            // p-1.5 / -m-1.5: overflow-x:auto forces the block axis to `auto`
            // too, so this scrollport clips vertically as well, and at
            // scrollLeft:0 it clips the left edge — cutting the selected
            // thumbnail's 3px ring on two sides. Padding by more than the ring
            // width and pulling it back with the matching negative margin gives
            // the ring room inside the scrollport without moving the row.
            //
            // scroll-p-1.5 is the other half of the fix and is NOT optional:
            // snap-mandatory aligns a snap-start item with the SNAPPORT, which
            // is the padding box unless scroll-padding insets it. Without it
            // the row rests at scrollLeft 6 with the first thumbnail flush
            // against the visible edge, scrolling the padding we just added out
            // of view and cutting the ring again — measurably, at every width
            // where the row overflows.
            className="-m-1.5 flex min-w-0 gap-[22px] snap-x snap-mandatory scroll-p-1.5 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {animals.map((thumbnail, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={thumbnail.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-pressed={isSelected}
                  className="shrink-0 snap-start text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-organic-accent-100 rounded-[20px]"
                >
                  <span
                    className={clsx(
                      "relative block size-[78px] overflow-hidden rounded-full bg-organic-neutral-300",
                      isSelected && "shadow-[0_0_0_3px_var(--primary)]",
                    )}
                  >
                    {thumbnail.imageUrl ? (
                      <Image
                        src={thumbnail.imageUrl}
                        alt=""
                        fill
                        sizes="78px"
                        className="object-cover object-[50%_30%]"
                      />
                    ) : (
                      <PhotoIcon
                        className="absolute inset-0 m-auto size-8 text-organic-neutral-600"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="mt-[7px] block max-w-[78px] truncate text-[12.5px]">
                    {thumbnail.name}
                  </span>
                </button>
              );
            })}

            {remainingCount > 0 && (
              <Link
                href="/pets"
                className="shrink-0 snap-start text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-organic-accent-100 rounded-[20px]"
              >
                <span className="grid size-[78px] place-items-center rounded-full border border-dashed border-organic-accent-400 font-display text-[15px] text-organic-accent-700">
                  +{remainingCount}
                </span>
                <span className="mt-[7px] block text-[12.5px]">Everyone</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SpotlightHero;
