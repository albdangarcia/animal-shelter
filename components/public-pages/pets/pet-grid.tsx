import { fetchPublishedPets } from "@/app/lib/data/public.data";
import { auth } from "@/auth";
import { PhotoIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";
import LikeButton from "../like-button";
import { calculateAgeString } from "@/app/lib/utils/date-utils";
import { SimplePagination } from "@/components/simple-pagination";

interface Props {
  query: string;
  currentPage: number;
  speciesName: string;
}

const PetGrid = async ({ query, currentPage, speciesName }: Props) => {
  const session = await auth();
  const currentUserPersonId = session?.user?.personId;

  const { pets, totalPages } = await fetchPublishedPets(
    query,
    currentPage,
    speciesName,
  );

  if (pets.length === 0) {
    return (
      <div className="text-center text-muted-foreground mt-10">
        <p>No pets found matching your criteria.</p>
      </div>
    );
  }

  return (
    <>
      <div className="my-6 mb-12 grid gap-4 gap-y-14 grid-cols-[repeat(auto-fit,minmax(--spacing(40),1fr))]">
        {pets.map((pet) => {
          const isLikedByCurrentUser = !!(
            currentUserPersonId && pet.likes?.length > 0
          );
          const ageString = calculateAgeString({
            birthDate: pet.birthDate,
            simple: true,
          });

          return (
            <Link
              href={`/pets/${pet.id}`}
              key={pet.id}
              className="relative max-w-56 bg-card block hover:shadow-lg transition-shadow duration-150 ease-in-out group rounded-lg"
            >
              <div className="relative w-full aspect-square overflow-hidden rounded-lg">
                {pet.animalImages?.length > 0 ? (
                  <Image
                    src={pet.animalImages[0].url}
                    alt={`Photo of ${pet.name}`}
                    fill
                    sizes="(max-width: 480px) 80vw, (max-width: 768px) 40vw, (max-width: 1024px) 30vw, 224px"
                    placeholder={`data:image/svg+xml;base64,${toBase64(
                      shimmer(224, 224),
                    )}`}
                    className="rounded-md object-cover group-hover:scale-110 transition-transform duration-300 ease-in-out"
                  />
                ) : (
                  <div className="w-full h-full bg-muted rounded-md flex items-center justify-center">
                    <PhotoIcon className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="absolute -bottom-6.5 left-2 right-2">
                <div className="text-sm flex flex-col px-4 py-2 bg-card shadow-lg rounded-lg relative">
                  <span className="font-semibold w-full">{pet.name}</span>
                  <div className="text-xs text-muted-foreground">
                    <span>{`${ageString} • ${pet.city}`}</span>
                  </div>
                  <div className="absolute -top-4 right-2 z-10">
                    <LikeButton
                      animalId={pet.id}
                      currentUserPersonId={currentUserPersonId}
                      isLikedByCurrentUser={isLikedByCurrentUser}
                    />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="flex justify-center">
        <SimplePagination totalPages={totalPages} />
      </div>
    </>
  );
};

export default PetGrid;
