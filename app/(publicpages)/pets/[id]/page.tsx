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

interface Props {
  params: IDParamType;
}

/**
 * The page the homepage hero is a preview of, so it speaks the hero's language:
 * the animal is introduced in the accent band with the same Caprasimo meta line
 * in terracotta and the same 17.5px description, and the same animal reads as
 * the same animal in both places.
 *
 * The hero's sage waiting pill is the one piece that is NOT here. It needs
 * `currentStayDays`, which is derived from the animal's intake/outcome events;
 * this page's fetcher selects none of them, and a second query to print one
 * line is not worth it.
 */
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

  // Breed · age · weight — the hero's three segments, species dropped
  // there and dropped here for the same reason. Age used to be a badge in the
  // top-right corner; it lives in this line now.
  const meta = [
    breedString,
    ageString,
    formatWeight(animal.currentWeightGrams),
  ].filter(Boolean);

  // Neutered and Microchipped are facts about the animal's body, but they read
  // as reassurances rather than measurements — so they join the characteristic
  // pills instead of sitting in the facts list as Yes/No rows. Never assert the
  // negative: an animal that isn't neutered simply drops the word.
  const pills = [
    animal.isSpayedNeutered && "Neutered",
    animal.hasMicrochip && "Microchipped",
    ...(animal.characteristics?.map((char) => char.name) ?? []),
  ].filter((pill): pill is string => Boolean(pill));

  const adoptCta =
    animal.listingStatus === "PENDING_ADOPTION" ? (
      <div className="inline-flex cursor-not-allowed items-center rounded-full bg-organic-accent-300 px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-organic-accent-900">
        Pending Adoption
      </div>
    ) : currentUserHasActiveApplication ? (
      <Link
        href="/dashboard/my-adoption-applications"
        className="inline-flex items-center rounded-full bg-secondary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-secondary-foreground transition-colors hover:shadow-organic-md"
      >
        View Your Application
      </Link>
    ) : (
      <Link
        href={`${animalId}/adopt`}
        className="inline-flex items-center rounded-full bg-primary px-[26px] py-[13px] font-display text-[15px] leading-[1.2] text-primary-foreground transition-colors hover:bg-organic-accent-600"
      >
        Adopt {animal.name}
      </Link>
    );

  return (
    <>
      {/* The same accent band the nav carries, so the two read as one surface */}
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-14">
          {/* Smaller than the hero's 104px ceiling — this page has a gallery,
              a facts list and a description under it, where the hero has only
              a button. break-words is the same backstop the hero relies on for
              a long or wide-glyph name. */}
          <h1 className="mb-2.5 font-display text-[clamp(40px,6vw,76px)] leading-[0.94] tracking-[-0.03em] break-words">
            {animal.name}
          </h1>

          <p className="mb-[18px] flex flex-wrap items-center gap-2.5 font-display text-[22px] leading-[1.55] text-organic-accent-700">
            {meta.map((item, index) => (
              <span key={index} className="inline-flex items-center gap-2.5">
                {index > 0 && (
                  <span aria-hidden="true" className="text-[12px] align-middle">
                    •
                  </span>
                )}
                <span>{item}</span>
              </span>
            ))}
          </p>

          {adoptCta}
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-x-12 gap-y-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-2 lg:gap-y-0 lg:px-14">
        <PetGallery
          images={animal.animalImages}
          currentUserPersonId={currentUserPersonId}
          animalId={animal.id}
          isLikedByCurrentUser={isLikedByCurrentUser}
        />

        <div className="flex flex-col gap-9">
          {/* Key facts as hairline rows — the same directory treatment as
              /contact. No surface and no shadow: the rules carry the
              structure. */}
          <dl className="m-0">
            <PetCardDetail label="Species" value={animal.species.name} />
            <PetCardDetail
              label="Sex"
              value={formatSingleEnumOption(animal.sex)}
            />
            <PetCardDetail label="Breed" value={breedString} />
            <PetCardDetail label="Size" value={formatAnimalSize(animal.size)} />
            <PetCardDetail label="Primary Color" value={primaryColorName} />
            <PetCardDetail label="Other Colors" value={additionalColorString} />
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
            <div>
              <h2 className="mb-3 font-display text-[21px]">
                About {animal.name}
              </h2>
              {/* Matching the hero's description exactly: no clamp, and
                  text-wrap:pretty against a 46ch measure. */}
              <p className="max-w-[46ch] text-[17.5px] leading-[1.65] whitespace-pre-wrap text-pretty text-organic-neutral-800">
                {animal.description}
              </p>
            </div>
          )}

          {pills.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-[21px]">
                Personality &amp; Needs
              </h2>
              {/* .tag.tag-accent-2 — the card's slot-3 colors, at the hero
                  kicker's size, because these sit next to 17.5px body copy
                  rather than inside a 240px card. */}
              <div className="flex flex-wrap gap-2">
                {pills.map((pill) => (
                  <span
                    key={pill}
                    className="inline-flex items-center rounded-full bg-organic-sage-100 px-3.5 py-[5px] text-[12.5px] tracking-[0.02em] text-organic-sage-800"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const PetCardDetail = ({ label, value, unit }: PetDetailProps) => {
  // If value is null, undefined, or an empty string, don't render the detail.
  // We allow 0 as a valid value (e.g., 0 years old for a very young pet).
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-[15px] text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right text-[15px] text-foreground">
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
