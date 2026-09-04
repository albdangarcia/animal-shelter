import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the public shell of `MyApplicationForm` (`variant="public"`): the
 * accent band, then three hairline-separated sections laid out as
 * `0.8fr / 1fr` with the step marker in the left column. No Cards — the real
 * page has none, and a skeleton that models a different layout makes the swap
 * to real content look like a reflow bug.
 */

const FieldSkeleton = ({ className }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="mb-2 h-4 w-24" />
    <Skeleton className="h-9 w-full rounded-md" />
  </div>
);

const RadioSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-4 w-40" />
    <div className="flex items-center space-x-6">
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  </div>
);

const SectionSkeleton = ({
  step,
  titleWidth,
  contentClassName,
  children,
}: {
  step: number;
  titleWidth: string;
  contentClassName?: string;
  children: React.ReactNode;
}) => (
  <section className={step > 1 ? "border-t border-border pt-10 sm:pt-14" : ""}>
    <div className="grid gap-7 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
      <div className="lg:sticky lg:top-8 lg:self-start">
        {/* The step marker is real text, not a bar: it is known before the
            data is, and it is the one thing on the page worth reading while
            the rest loads. */}
        <div className="mb-2 font-display text-[13px] tracking-[0.06em] text-organic-accent-700">
          Step {step} of 3
        </div>
        <Skeleton className={`h-8 ${titleWidth}`} />
      </div>
      <div className={`min-w-0 ${contentClassName ?? ""}`.trim()}>
        {children}
      </div>
    </div>
  </section>
);

const Loading = () => {
  return (
    <>
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
          <h1 className="mb-5 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
            Adoption Application
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
            Three short sections about you and your home, so we can be sure
            this is a good fit.
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-16 sm:px-8 sm:pt-12 lg:px-14 lg:pb-20">
        {/* Which animal, in the field column — the one line here that needs
            the request to resolve. */}
        <div className="mb-10 grid gap-7 sm:mb-14 lg:grid-cols-[0.8fr_minmax(0,1fr)] lg:gap-16">
          <Skeleton className="h-5 w-full max-w-[42ch] lg:col-start-2" />
        </div>

        <div className="space-y-10 sm:space-y-14">
          <SectionSkeleton
            step={1}
            titleWidth="w-52"
            contentClassName="space-y-6"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <Separator />
            <div className="space-y-6">
              <FieldSkeleton />
              <FieldSkeleton />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <FieldSkeleton />
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
            </div>
          </SectionSkeleton>

          <SectionSkeleton
            step={2}
            titleWidth="w-44"
            contentClassName="space-y-8"
          >
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
              <RadioSkeleton />
              <RadioSkeleton />
            </div>
            <Separator />
            <div>
              <Skeleton className="mb-2 h-4 w-28" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </SectionSkeleton>

          <SectionSkeleton
            step={3}
            titleWidth="w-48"
            contentClassName="space-y-8"
          >
            <div>
              <Skeleton className="mb-2 h-4 w-36" />
              <Skeleton className="h-25 w-full rounded-md" />
            </div>
            <div>
              <Skeleton className="mb-2 h-4 w-40" />
              <Skeleton className="h-25 w-full rounded-md" />
            </div>
          </SectionSkeleton>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-10 sm:flex-row sm:justify-end sm:gap-4 sm:pt-14">
            <Skeleton className="h-11 w-full rounded-full sm:w-28" />
            <Skeleton className="h-11 w-full rounded-full sm:w-44" />
          </div>
        </div>
      </main>
    </>
  );
};

export default Loading;
