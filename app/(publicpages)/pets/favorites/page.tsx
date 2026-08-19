import { auth } from "@/auth";
import FavoritesGrid from "@/components/public-pages/pets/favorites/favorites-grid";

const Page = async () => {
  const session = await auth();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-3xl font-medium">My Favorites</div>
        <div className="text-sm text-gray-500">Pets you&apos;ve liked</div>
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