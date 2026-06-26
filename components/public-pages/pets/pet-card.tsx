import { PhotoIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";
import LikeButton from "../like-button";
import { calculateAgeString } from "@/app/lib/utils/date-utils";

export interface PetCardData {
  id: string;
  name: string;
  city: string | null;
  birthDate: Date;
  animalImages: { url: string }[];
  likes?: { userId: string }[];
}

interface PetCardProps {
  pet: PetCardData;
  currentUserPersonId: string | undefined;
  /**
   * When false, the card is rendered greyed-out with an "Unavailable" badge and
   * is NOT clickable through to the detail page (which would 404 for archived
   * pets). The like button stays interactive so the user can still unlike it.
   */
  isAvailable?: boolean;
}

const PetCard = ({
  pet,
  currentUserPersonId,
  isAvailable = true,
}: PetCardProps) => {
  const isLikedByCurrentUser = !!(
    currentUserPersonId && (pet.likes?.length ?? 0) > 0
  );
  const ageString = calculateAgeString({
    birthDate: pet.birthDate,
    simple: true,
  });

  const inner = (
    <>
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
            className={clsx(
              "rounded-md object-cover transition-transform duration-300 ease-in-out",
              isAvailable && "group-hover:scale-110",
              !isAvailable && "grayscale",
            )}
          />
        ) : (
          <div className="w-full h-full bg-muted rounded-md flex items-center justify-center">
            <PhotoIcon className="w-16 h-16 text-muted-foreground" />
          </div>
        )}

        {!isAvailable && (
          <div className="absolute inset-0 rounded-lg bg-background/40 flex items-start justify-start p-2">
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-muted-foreground shadow">
              Unavailable
            </span>
          </div>
        )}
      </div>

      <div className="absolute -bottom-6.5 left-2 right-2">
        <div className="text-sm flex flex-col px-4 py-2 bg-card shadow-lg rounded-lg relative">
          <span className="font-semibold w-full">{pet.name}</span>
          <div className="text-xs text-muted-foreground">
            <span>{`${ageString} • ${pet.city ?? ""}`}</span>
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
    </>
  );

  const wrapperClass =
    "relative max-w-56 bg-card block rounded-lg group transition-shadow duration-150 ease-in-out";

  // Available pets link through to the detail page; unavailable ones render a
  // non-clickable div (the detail fetcher only serves available pets, so a link
  // would 404). The like button inside still works in both cases.
  if (isAvailable) {
    return (
      <Link href={`/pets/${pet.id}`} className={clsx(wrapperClass, "hover:shadow-lg")}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={clsx(wrapperClass, "cursor-default")} aria-disabled="true">
      {inner}
    </div>
  );
};

export default PetCard;