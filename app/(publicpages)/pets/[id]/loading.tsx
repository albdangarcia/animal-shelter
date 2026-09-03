import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the rebuilt detail page: the accent band paints immediately — it is
 * the top of the page and continues the nav's surface, so it must not arrive
 * late — with placeholders for the name, meta line, location and CTA, then the
 * gallery and the hairline facts rows below.
 */
const Loading = () => {
  return (
    <>
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-14">
          {/* Name at clamp(40px,6vw,76px), leading 0.94 */}
          <Skeleton className="mb-2.5 h-[clamp(38px,5.7vw,72px)] w-[min(100%,320px)] rounded-[16px]" />
          {/* Caprasimo meta line */}
          <Skeleton className="mb-[18px] h-[26px] w-[min(100%,280px)] rounded-full" />
          {/* Location */}
          <Skeleton className="mb-7 h-[19px] w-40 rounded-full" />
          {/* Adopt CTA pill — 13px 26px around 15px text */}
          <Skeleton className="h-[44px] w-44 rounded-full" />
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
