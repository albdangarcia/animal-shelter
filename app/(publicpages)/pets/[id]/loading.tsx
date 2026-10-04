import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the rebuilt detail page: the accent band paints immediately — it is
 * the top of the page and continues the nav's surface, so it must not arrive
 * late — with placeholders for the name, meta line and CTA, then the
 * gallery and the hairline facts rows below.
 */
const Loading = () => {
  return (
    <>
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-14">
          {/* Use the same typography so 1lh follows the organic theme's line height. */}
          <Skeleton className="mb-2.5 h-[1lh] font-display text-[clamp(40px,6vw,76px)] leading-[0.94] w-[min(100%,320px)] rounded-[16px]" />
          {/* Breed, age and weight use the same line boxes and wrapping gap as
              the loaded metadata. There is no location row on this page. */}
          <div className="mb-[18px] flex flex-wrap items-center gap-2.5 font-display text-[22px] leading-[1.55]">
            <Skeleton className="h-[1lh] w-[min(100%,248px)] rounded-full" />
            <div className="inline-flex items-center gap-2.5">
              <Skeleton className="size-[6px] rounded-full" />
              <Skeleton className="h-[1lh] w-[77px] rounded-full" />
            </div>
            <div className="inline-flex items-center gap-2.5">
              <Skeleton className="size-[6px] rounded-full" />
              <Skeleton className="h-[1lh] w-[92px] rounded-full" />
            </div>
          </div>
          {/* Adopt CTA pill — 13px 26px around 15px text */}
          <Skeleton className="h-[calc(1lh+26px)] w-44 font-display text-[15px] leading-[1.2] rounded-full" />
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-x-12 gap-y-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-2 lg:gap-y-0 lg:px-14">
        {/* Gallery (left column) */}
        <div className="flex flex-col gap-y-2">
          {/* Large image */}
          <Skeleton className="h-75 w-full rounded-[28px]" />
          {/* Thumbnail row */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-[16px]" />
            ))}
          </div>
        </div>

        {/* Details (right column) */}
        <div className="flex flex-col gap-9">
          {/* Facts as hairline rows — no surface, matching the page */}
          <div>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0"
              >
                <Skeleton className="h-[19px] w-24" />
                <Skeleton className="h-[19px] w-28" />
              </div>
            ))}
          </div>

          {/* About section */}
          <div>
            <Skeleton className="mb-3 h-[25px] w-44" />
            <div className="max-w-[46ch] space-y-2">
              <Skeleton className="h-[19px] w-full" />
              <Skeleton className="h-[19px] w-full" />
              <Skeleton className="h-[19px] w-2/3" />
            </div>
          </div>

          {/* Personality & Needs pills */}
          <div>
            <Skeleton className="mb-3 h-[25px] w-52" />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-[28px] rounded-full"
                  style={{ width: `${4.5 + i * 0.75}rem` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Loading;
