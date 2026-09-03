import Link from "next/link";
import { getCachedSession } from "@/app/lib/auth/session";
import FavoritesGrid from "@/components/public-pages/pets/favorites/favorites-grid";

// Sign-in returns the visitor here rather than to the dashboard. Same contract
// LoginPromptModal already builds when a signed-out visitor taps a heart —
// that's the other door into this page, and both should come back to it.
const SIGN_IN_HREF = `/sign-in?callbackUrl=${encodeURIComponent(
  "/pets/favorites",
)}`;

const Page = async () => {
  const session = await getCachedSession();
  const isSignedIn = Boolean(session?.user?.personId);

  return (
    <>
      {/* The same accent band the nav carries, so the two read as one surface
          and there's no seam under the nav. Both pages
          are grids of animals and should open the same way.

          No live count here: the number of saved animals comes from
          fetchFavoritePets(), which runs inside FavoritesGrid, and surfacing it
          in the band would mean fetching twice. The supporting line branches on
          the session the page has already read instead. */}
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
          {/* "favorites", matching the nav link that brings you here and
              LikeButton's "Save to favorites". The route keeps its US spelling
              — it's linked from the nav and the avatar menu, and renaming a URL
              over spelling isn't worth a redirect. */}
          <h1 className="mb-4 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
            favorites
          </h1>

          {/* The signed-in line has to be true with an empty list too — the
              band can't see the count (that's inside FavoritesGrid), so it
              frames the page rather than describing its contents. Saying "tap
              the heart to remove one" here would contradict the empty state
              directly below it. */}
          <p className="text-[15px] text-organic-neutral-800">
            {isSignedIn
              ? "Animals you've saved, kept here so you can come back to them."
              : "Save the animals you want to come back to."}
          </p>
        </div>
      </section>

      {/* The layout is full-bleed now, so every page owns its own container. */}
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-14">
        {isSignedIn ? <FavoritesGrid /> : <SignedOutState />}
      </div>
    </>
  );
};

/**
 * A designed state, not a one-line apology. This is the first thing a curious
 * visitor hits, and the version it replaces dead-ended — it explained the
 * restriction and offered no way past it.
 *
 * Same vocabulary as /pets's empty state so the two read as one system.
 */
const SignedOutState = () => (
  <div className="py-20 text-center">
    <h2 className="font-display text-[clamp(24px,4vw,32px)]">
      Sign in to see your favorites
    </h2>
    <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-organic-neutral-800">
      Saved animals live with your account, so they&apos;re still here whenever
      you pick the search back up.
    </p>

    <Link
      href={SIGN_IN_HREF}
      className="mt-7 inline-flex rounded-full bg-primary px-[26px] py-[13px] text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-organic-accent-600"
    >
      Sign in
    </Link>

    {/* Someone who doesn't want an account still needs somewhere to go — the
        band has just promised them animals. */}
    <p className="mt-5 text-[15px] text-organic-neutral-800">
      Or{" "}
      <Link
        href="/pets"
        className="whitespace-nowrap text-primary underline underline-offset-4 hover:no-underline"
      >
        browse everyone looking for a home
      </Link>
      .
    </p>
  </div>
);

export default Page;
