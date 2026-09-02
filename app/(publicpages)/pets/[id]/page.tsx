import { fetchPublicPagePetById } from "@/app/lib/data/public.data";
import { IDParamType } from "@/app/lib/types";
import {
  calculateAgeString,
  formatDateToLongString,
} from "@/app/lib/utils/date-utils";
import { formatWeight } from "@/app/lib/utils/weight-format";
import {
  formatSingleEnumOption,
  formatAnimalSize,
} from "@/app/lib/utils/enum-formatter";
import PetGallery from "@/components/public-pages/pets/pet-gallery";
import { getCachedSession } from "@/app/lib/auth/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPinIcon } from "@heroicons/react/24/outline";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const session = await getCachedSession();
  const currentUserPersonId = session?.user?.personId;

  const animal = await fetchPublicPagePetById(animalId);
  if (!animal) {
    notFound();
  }

  // Calculate age string
  const ageString = calculateAgeString({
    birthDate: animal.birthDate,
    simple: true,
  });

  // Format birth date for display using the utility function
  const formattedBirthDate = formatDateToLongString(animal.birthDate);

  const currentUserHasActiveApplication =
    currentUserPersonId &&
    animal.adoptionApplications?.some(
      (app) => app.applicantId === currentUserPersonId,
    );

  const isLikedByCurrentUser = Boolean(animal.likes && animal.likes.length > 0);

  // Prepare array data for display
  const breedString =
    animal.breeds?.map((b) => b.name).join(", ") || "Mixed Breed";

  // Primary color shown on its own; remaining colors listed separately.
  const primaryColorName = animal.primaryColor?.name || "";
  const additionalColorString =
    animal.colors
      ?.filter((c) => c.name !== animal.primaryColor?.name)
      .map((c) => c.name)
      .join(", ") || "";

  const adoptCta =
    animal.listingStatus === "PENDING_ADOPTION" ? (
      <div className="block w-full cursor-not-allowed rounded-full bg-organic-accent-300 px-8 py-3 text-center text-lg font-semibold text-organic-accent-900 shadow-organic-sm">
        Pending Adoption
      </div>
    ) : currentUserHasActiveApplication ? (
      <Link
        href="/dashboard/my-adoption-applications"
        className="block w-full rounded-full bg-secondary px-8 py-3 text-center text-lg font-semibold text-secondary-foreground shadow-organic-sm transition-colors duration-150 ease-in-out hover:shadow-organic-md"
      >
        View Your Application
      </Link>
    ) : (
      <Link
        href={`${animalId}/adopt`}
        className="block w-full rounded-full bg-primary px-8 py-3 text-center text-lg font-semibold text-primary-foreground shadow-organic-sm transition-colors duration-150 ease-in-out hover:bg-organic-accent-600 hover:shadow-organic-md"
      >
        Adopt {animal.name}
      </Link>
    );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-x-8 gap-y-6 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-2 lg:gap-y-0 lg:px-14">
      <PetGallery
        images={animal.animalImages}
        currentUserPersonId={currentUserPersonId}
        animalId={animal.id}
        isLikedByCurrentUser={isLikedByCurrentUser}
      />

      <div className="flex flex-col space-y-5">
        {/* Name, location, age badge */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[clamp(38px,6vw,56px)] text-foreground">
              {animal.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center">
              <MapPinIcon className="size-5 inline mr-1 text-primary" />
              {animal.city}, {animal.state}
            </p>
          </div>
          {ageString && (
            <span className="shrink-0 rounded-full bg-organic-accent-200 px-3 py-1 text-sm font-medium whitespace-nowrap text-organic-accent-800">
              {ageString}
            </span>
          )}
        </div>

        {/* Primary action, kept near the top */}
        {adoptCta}

        {/* Key facts as a two-column key/value table */}
        <dl className="rounded-[20px] bg-card px-4 sm:grid sm:grid-cols-2 sm:gap-x-8">
          <PetCardDetail label="Species" value={animal.species.name} />
          <PetCardDetail label="Sex" value={formatSingleEnumOption(animal.sex)} />
          <PetCardDetail label="Breed" value={breedString} />
          <PetCardDetail label="Size" value={formatAnimalSize(animal.size)} />
          <PetCardDetail label="Primary Color" value={primaryColorName} />
          <PetCardDetail label="Other Colors" value={additionalColorString} />
          <PetCardDetail
            label="Spayed/Neutered"
            value={animal.isSpayedNeutered ? "Yes" : "No"}
          />
          <PetCardDetail
            label="Weight"
            value={
              animal.currentWeightGrams != null
                ? formatWeight(animal.currentWeightGrams)
                : null
            }
          />
          <PetCardDetail label="Height" value={animal.heightCm} unit="cm" />
          <PetCardDetail label="Date of Birth" value={formattedBirthDate} />
        </dl>

        {animal.description && (
          <div className="pt-4 border-t">
            <h3 className="font-medium text-foreground text-lg mb-2">
              About {animal.name}
            </h3>
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {animal.description}
            </p>
          </div>
        )}

        {animal.characteristics && animal.characteristics.length > 0 && (
          <div className="pt-4 border-t">
            <h3 className="font-medium text-foreground text-lg mb-3">
              Personality &amp; Needs
            </h3>
            <div className="flex flex-wrap gap-3">
              {animal.characteristics.map((char) => (
                <span
                  key={char.name}
                  className="rounded-full bg-organic-accent-200 px-3 py-1 text-sm font-medium text-organic-accent-800"
                >
                  {char.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PetCardDetail = ({ label, value, unit }: PetDetailProps) => {
  // If value is null, undefined, or an empty string, don't render the detail.
  // We allow 0 as a valid value (e.g., 0 years old for a very young pet).
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/70 last:border-b-0 sm:nth-last-2:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground text-right">
        {value}
        {unit ? ` ${unit}` : ""}
      </dd>
    </div>
  );
};

interface PetDetailProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}

export default Page;