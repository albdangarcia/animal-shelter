import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { fetchAvailableAnimalCount } from "@/app/lib/data/public.data";

/**
 * Static apart from the live count. That one line sits in its own Suspense
 * boundary so the accent band paints with the nav instead of waiting on a
 * query — the band is the top of the page and must not arrive late.
 */

const Page = () => (
  <>
    {/* The same accent band the nav carries, so the two read as one surface */}
    <section className="bg-organic-accent-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
        {/* The mission statement is the heading — there is no smaller title
            above it. */}
        <h1 className="mb-7 max-w-[18ch] font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
          Every animal deserves somewhere safe to wait for the right home.
        </h1>

        <Suspense fallback={<p className="text-[15px]">&nbsp;</p>}>
          <LookingForHomesLine />
        </Suspense>
      </div>
    </section>

    <section
      aria-labelledby="visit-heading"
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14"
    >
      <h2 id="visit-heading" className="mb-7 font-display text-[32px]">
        Visit us
      </h2>

      {/* One address, matching the footer. `Location` carries no address
          fields, so a card per city would describe something the data model
          can't hold. Multiple branches are a real feature and get a real
          design when they exist. */}
      <dl className="grid gap-8 sm:grid-cols-2 sm:gap-10">
        <div>
          <dt className="mb-2 font-display text-[12px] tracking-[0.08em] text-organic-neutral-500 uppercase">
            Address
          </dt>
          <dd className="m-0 text-[17px] leading-[1.6] text-organic-neutral-800">
            248 Rescue Way
            <br />
            Brooklyn, NY 11201
          </dd>
        </div>

        <div>
          <dt className="mb-2 font-display text-[12px] tracking-[0.08em] text-organic-neutral-500 uppercase">
            Opening hours
          </dt>
          <dd className="m-0 text-[17px] leading-[1.6] text-organic-neutral-800">
            Wednesday to Sunday
            <br />
            11am – 6pm
          </dd>
        </div>
      </dl>
    </section>

    <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 lg:px-14 lg:pb-20">
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-[28px]">
        <Image
          src="/homeimage15.webp"
          alt="A merle puppy in a blue harness sitting on grass."
          fill
          sizes="(max-width: 1152px) 100vw, 1152px"
          className="object-cover"
        />
      </div>
    </section>
  </>
);

/** The one thing on this page that isn't static. */
const LookingForHomesLine = async () => {
  const availableCount = await fetchAvailableAnimalCount();

  return (
    <Link
      href="/pets"
      className="inline-flex text-[15px] text-organic-accent-700 hover:underline"
    >
      {availableCount} {availableCount === 1 ? "animal is" : "animals are"}{" "}
      looking for homes right now →
    </Link>
  );
};

export default Page;
