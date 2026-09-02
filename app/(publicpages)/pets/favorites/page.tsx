import { getCachedSession } from "@/app/lib/auth/session";
import FavoritesGrid from "@/components/public-pages/pets/favorites/favorites-grid";

const Page = async () => {
  const session = await getCachedSession();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-10 sm:px-8 sm:py-14 lg:px-14">
      <div className="space-y-1">
        <h1 className="font-display text-[clamp(38px,6vw,56px)]">
          My Favorites
        </h1>
        <div className="text-sm text-muted-foreground">
          Pets you&apos;ve liked
        </div>
      </div>

      {session?.user?.personId ? (
        <FavoritesGrid />
      ) : (
        <div className="text-center text-muted-foreground mt-10">
          <p>Sign in to see the pets you&apos;ve liked.</p>
        </div>
      )}
    </div>
  );
};

export default Page;