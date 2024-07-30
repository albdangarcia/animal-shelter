import { createPetLike, deletePetLike } from "@/app/lib/actions/pet";
import { fetchFilteredPublishedPetsWithCategory } from "@/app/lib/data/pets/public";
import { auth } from "@/auth";
import { HeartIcon } from "@heroicons/react/24/outline";
import { PhotoIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";

export default async function PetCard({
  query,
  currentPage,
  speciesName,
}: {
  query: string;
  currentPage: number;
  speciesName: string;
}) {
  // user session
  const session = await auth();
  // fetch pets
  const pets = await fetchFilteredPublishedPetsWithCategory(
    query,
    currentPage,
    speciesName,
    session
  );
  return (
    <div className="mt-6 flex gap-3 flex-wrap">
      {pets?.map((pet) => (
        <div
          key={pet.id}
          className="bg-white relative border border-gray-200 p-4 shadow-md rounded-md w-40 flex flex-col items-center justify-center"
        >
          {session && session.user.id ? (
            <form
              action={async () => {
                "use server";
                if (pet.likes && pet.likes.length > 0) {
                  await deletePetLike(pet.id, session.user.id);
                } else {
                  await createPetLike(pet.id, session.user.id);
                }
              }}
            >
              <button type="submit" className="absolute top-2 right-2">
                <HeartIcon
                  className={clsx(
                    "h-6 w-6 text-red-300",
                    pet.likes &&
                      pet.likes.length > 0 &&
                      "fill-red-300 text-red-300"
                  )}
                />
              </button>
            </form>
          ) : (
            <button type="submit" className="absolute top-2 right-2">
              <HeartIcon
                className={clsx(
                  "h-6 w-6 text-red-300",
                  pet.likes &&
                    pet.likes.length > 0 &&
                    "fill-red-300 text-red-300"
                )}
              />
            </button>
          )}

          <Link href={`/pets/${pet.id}`}>
            <div className="w-full">
              {pet.petImages.length > 0 ? (
                <Image
                  src={pet.petImages[0].url}
                  alt="Pet"
                  width={637}
                  height={637}
                  className="rounded-md w-28 h-28 object-cover"
                />
              ) : (
                <div className="w-28 h-28 bg-gray-200 rounded-md flex">
                  <PhotoIcon className="w-8 h-8 m-auto text-gray-500" />
                </div>
              )}
              <p className="font-medium w-28 overflow-hidden truncate">
                {pet.name}
              </p>
              <h2 className="text-sm text-gray-600">{`${pet.city}, ${pet.state}`}</h2>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
