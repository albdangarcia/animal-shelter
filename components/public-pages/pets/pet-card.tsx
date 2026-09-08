import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { AnimalSize } from "@/prisma/generated/enums";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";
import { PET_PHOTO_COMING_SOON_IMAGE } from "@/app/lib/constants/constants";
import LikeButton from "../like-button";
import { calculateAgeString } from "@/app/lib/utils/date-utils";
import { formatAnimalSize } from "@/app/lib/utils/enum-formatter";

export interface PetCardData {
  id: string;
  name: string;
  birthDate: Date;
  size: AnimalSize | null;
  species: { name: string };
  breeds: { name: string }[];
  characteristics: { name: string }[];
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

  // Breed, size, characteristic — in that order, skipping whatever the animal
  // doesn't have. Three sources, so the "at most three tags" rule holds by
  // construction. An animal with no characteristics shows two tags rather than
  // a gap, and one with none shows no tag row at all.
  //
  // The first tag falls back to the species name, because pickBreeds() leaves
  // some species with no breed at all — without it a breedless card never says
  // what kind of animal it is.
  //
  // Each slot carries its own variant from organic.css (.tag-accent,
  // .tag-neutral, .tag-accent-2), and the variant belongs to the SLOT, not to
  // the position in the rendered row. Pairing the class with the label BEFORE
  // the filter is what enforces that: `size` is null for any animal whose breed
  // has no typical size (the seed's "Mixed Breed" is one), so deriving the
  // variant from the filtered index instead would slide sage up into the size
  // slot and recolor the row depending on which fields happen to be recorded.
  const tags = [
    {
      label: pet.breeds[0]?.name ?? pet.species.name,
      className: "bg-organic-accent-100 text-organic-accent-800",
    },
    {
      label: formatAnimalSize(pet.size),
      className: "bg-organic-neutral-100 text-organic-neutral-800",
    },
    {
      label: pet.characteristics[0]?.name,
      className: "bg-organic-sage-100 text-organic-sage-800",
    },
  ].filter((tag): tag is { label: string; className: string } =>
    Boolean(tag.label),
  );

  const inner = (
    <>
      <div className="relative h-[210px] w-full overflow-hidden rounded-[20px]">
        {pet.animalImages?.length > 0 ? (
          <Image
            src={pet.animalImages[0].url}
            alt={`Photo of ${pet.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 280px"
            placeholder={`data:image/svg+xml;base64,${toBase64(
              shimmer(280, 210),
            )}`}
            className={clsx(
              "object-cover transition-transform duration-300 ease-in-out",
              isAvailable && "group-hover:scale-110",
              !isAvailable && "grayscale",
            )}
          />
        ) : (
          <Image
            src={PET_PHOTO_COMING_SOON_IMAGE}
            alt="Photo coming soon"
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 280px"
            // Matches the real photo above: a non-empty placeholder both covers
            // the decode and silences Next's lazy-LCP warning when a filtered
            // result puts a photo-less card above the fold.
            placeholder={`data:image/svg+xml;base64,${toBase64(
              shimmer(280, 210),
            )}`}
            className={clsx("object-contain", !isAvailable && "grayscale")}
          />
        )}

        {!isAvailable && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-start bg-background/40 p-2">
            <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-organic-sm">
              Unavailable
            </span>
          </div>
        )}

        <div className="absolute top-2 right-2">
          <LikeButton
            animalId={pet.id}
            currentUserPersonId={currentUserPersonId}
            isLikedByCurrentUser={isLikedByCurrentUser}
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        {/* min-w-0 + truncate so a long name ellipsizes rather than pushing the
            age out of the card in a narrow column. */}
        <span className="min-w-0 truncate font-display text-[21px]">
          {pet.name}
        </span>
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {ageString}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(({ label, className }, index) => (
            <span
              key={`${index}-${label}`}
              className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-0.75 text-[11px] tracking-[0.02em]",
                className,
              )}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {isAvailable && (
        // A span, not a button or a link: the whole card is already the link,
        // and nesting an interactive element inside it is invalid HTML.
        <span className="mt-auto block rounded-full bg-primary px-4 py-2.5 text-center text-[13.5px] font-semibold text-primary-foreground transition-colors group-hover:bg-organic-accent-600">
          Meet {pet.name}
        </span>
      )}
    </>
  );

  const wrapperClass =
    "group flex flex-col gap-[10px] rounded-[32px] bg-card p-[14px] transition-shadow duration-150 ease-in-out";

  // Available pets link through to the detail page; unavailable ones render a
  // non-clickable div (the detail fetcher only serves available pets, so a link
  // would 404). The like button inside still works in both cases.
  if (isAvailable) {
    return (
      <Link
        href={`/pets/${pet.id}`}
        className={clsx(wrapperClass, "hover:shadow-organic-md")}
      >
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
