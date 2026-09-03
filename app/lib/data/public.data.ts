import { getCachedSession } from "@/app/lib/auth/session";
import { AnimalListingStatus, AnimalSize, Sex } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { PublishedPetsSchema } from "../zod-schemas/animal.schemas";
import { ANIMAL_IMAGE_ORDER } from "../utils/animal-image-order";
import { calculateAgeString } from "../utils/date-utils";
import { computeStays, type StayEvent } from "../utils/stay-utils";

export type PetsPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    city: true;
    state: true;
    birthDate: true;
    listingStatus: true;
    size: true;
    species: {
      select: {
        name: true;
      };
    };
    breeds: {
      select: {
        name: true;
      };
    };
    characteristics: {
      select: {
        name: true;
      };
    };
    animalImages: {
      select: {
        url: true;
      };
      take: 1;
    };
    likes: {
      select: {
        userId: true;
      };
      take: 1;
    };
  };
}>;

// What PetCard turns into tags: first breed (or the species name, for the
// species pickBreeds() leaves breedless), size, first characteristic. Shared so
// every fetcher that feeds a PetCard selects the same set — a fetcher that skips
// one renders a card with a missing tag, and one that skips `species` renders a
// breedless card that never says what kind of animal it is.
// Soft-deleted breeds and characteristics are excluded: they are still attached
// to the animal but must never be shown publicly.
const PET_CARD_TAG_SELECT = {
  size: true,
  species: { select: { name: true } },
  breeds: { where: { deletedAt: null }, select: { name: true } },
  characteristics: { where: { deletedAt: null }, select: { name: true } },
} satisfies Prisma.AnimalSelect;

const ITEMS_PER_PAGE = 10

// Allowlist of sortable fields → Prisma orderBy. Never pass raw user input into
// orderBy; anything not in this map falls back to the default (newest first).
const SORT_MAP: Record<string, Prisma.AnimalOrderByWithRelationInput> = {
  "createdAt.desc": { createdAt: "desc" }, // Newest
  "createdAt.asc": { createdAt: "asc" }, // Oldest listing
  "birthDate.desc": { birthDate: "desc" }, // Youngest
  "birthDate.asc": { birthDate: "asc" }, // Oldest pet
  "name.asc": { name: "asc" }, // Name A–Z
};

const DEFAULT_SORT: Prisma.AnimalOrderByWithRelationInput = { createdAt: "desc" };

export interface FetchPublishedPetsArgs {
  query: string;
  currentPage: number;
  speciesName?: string;
  color?: string;
  sex?: string;
  size?: string;
  sort?: string;
}

export const fetchPublishedPets = async ({
  query: queryInput,
  currentPage: currentPageInput,
  speciesName: speciesNameInput,
  color: colorInput,
  sex: sexInput,
  size: sizeInput,
  sort: sortInput,
}: FetchPublishedPetsArgs): Promise<{
  pets: PetsPayload[];
  totalPages: number;
}> => {
  // Treat empty strings as "not provided" so optional schemas (especially the
  // regex-validated `sort`) skip them instead of failing validation. The page
  // passes "" defaults for absent params, which would otherwise trip the sort
  // regex on the unfiltered /pets view.
  const emptyToUndefined = (v?: string) => (v ? v : undefined);

  const validatedArgs = PublishedPetsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    speciesName: emptyToUndefined(speciesNameInput),
    color: emptyToUndefined(colorInput),
    sex: emptyToUndefined(sexInput),
    size: emptyToUndefined(sizeInput),
    sort: emptyToUndefined(sortInput),
  });

  if (!validatedArgs.success) {
    console.error(
      "Invalid arguments for fetching pets:",
      validatedArgs.error.flatten().fieldErrors,
    );
    throw new Error("Invalid arguments for fetching pets.");
  }
  const { query, currentPage, speciesName, color, sex, size, sort } =
    validatedArgs.data;

  // Split comma-joined facet params into clean lists. Sex/size are validated
  // against the real Prisma enums so crafted values can't reach the query.
  const colorNames = color?.split(",").filter(Boolean) ?? [];

  const sexValues = (sex?.split(",").filter(Boolean) ?? []).filter(
    (v): v is Sex => (Object.values(Sex) as string[]).includes(v),
  );
  const sizeValues = (size?.split(",").filter(Boolean) ?? []).filter(
    (v): v is AnimalSize =>
      (Object.values(AnimalSize) as string[]).includes(v),
  );

  const orderBy = (sort && SORT_MAP[sort]) || DEFAULT_SORT;

  const session = await getCachedSession();
  const personId = session?.user?.personId;

  const whereClause: Prisma.AnimalWhereInput = {
    listingStatus: {
      in: [AnimalListingStatus.PUBLISHED, AnimalListingStatus.PENDING_ADOPTION],
    },
    // Free-text search across name, breed, and city so adopters don't need to
    // know a pet's assigned name. Only applied when there's a query; combines
    // as AND with the species and color filters below.
    ...(query && {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        {
          breeds: {
            some: { name: { contains: query, mode: "insensitive" } },
          },
        },
        { city: { contains: query, mode: "insensitive" } },
      ],
    }),
    ...(speciesName && {
      species: {
        name: speciesName,
      },
    }),
    // OR-within color (any selected color), AND-across with species + query.
    // `some` matches the animal's full color set, so a pet shows if any of its
    // colors (primary or secondary) is one of the selected names.
    ...(colorNames.length > 0 && {
      colors: {
        some: {
          name: { in: colorNames },
        },
      },
    }),
    // Sex and size are enum fields (not relations), matched directly with `in`.
    ...(sexValues.length > 0 && {
      sex: { in: sexValues },
    }),
    ...(sizeValues.length > 0 && {
      size: { in: sizeValues },
    }),
  };

  try {
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    // Promise.all, not $transaction([...]). The array form pins both queries to
    // one connection and @prisma/adapter-pg then issues them concurrently on the
    // same `pg` client, which trips node-postgres' "client is already executing a
    // query" deprecation. Two pooled connections avoid it, and there is nothing
    // to preserve here: the count and the page share a filter but no invariant —
    // at worst a write between them makes the page count momentarily stale on a
    // public listing.
    const [totalCount, pets] = await Promise.all([
      prisma.animal.count({ where: whereClause }),
      prisma.animal.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          birthDate: true,
          ...PET_CARD_TAG_SELECT,
          animalImages: {
            select: {
              url: true,
            },
            orderBy: ANIMAL_IMAGE_ORDER,
            take: 1,
          },
          ...(personId && {
            likes: {
              select: {
                userId: true,
              },
              where: {
                userId: personId,
              },
              take: 1,
            },
          }),
          listingStatus: true,
        },
        orderBy,
        take: ITEMS_PER_PAGE,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    return { pets, totalPages };
  } catch (error) {
    console.error("Error fetching pets.", error);
    throw new Error("Error fetching pets.");
  }
};

export const fetchSpecies = async () => {
  try {
    const species = await prisma.species.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
    return species;
  } catch (error) {
    console.error("Error fetching species.", error);
    throw new Error("Error fetching species.");
  }
};

export const fetchColors = async () => {
  try {
    const colors = await prisma.color.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
    return colors;
  } catch (error) {
    console.error("Error fetching colors.", error);
    throw new Error("Error fetching colors.");
  }
};

export type FavoritePet = {
  id: string;
  name: string;
  city: string | null;
  birthDate: Date;
  listingStatus: AnimalListingStatus;
  size: AnimalSize | null;
  species: { name: string };
  breeds: { name: string }[];
  characteristics: { name: string }[];
  animalImages: { url: string }[];
  // Always present (these are the user's own likes), kept for PetCard's heart state.
  likes: { userId: string }[];
  isAvailable: boolean;
};

const AVAILABLE_STATUSES: AnimalListingStatus[] = [
  AnimalListingStatus.PUBLISHED,
  AnimalListingStatus.PENDING_ADOPTION,
];

/**
 * Fetches the signed-in user's liked pets, including ones that are no longer
 * available. Unavailable pets are flagged via `isAvailable` so the UI can grey
 * them out — we never expose WHY a pet is unavailable (archiveReason is never
 * selected), so adopted/transferred/deceased all read as a neutral "unavailable".
 *
 * Ordering: most recently liked first, but unavailable pets are always pushed to
 * the end (recency preserved within each group).
 */
export const fetchFavoritePets = async (): Promise<{
  pets: FavoritePet[];
}> => {
  const session = await getCachedSession();
  const personId = session?.user?.personId;

  if (!personId) {
    return { pets: [] };
  }

  try {
    const likes = await prisma.like.findMany({
      where: { userId: personId },
      orderBy: { createdAt: "desc" }, // most recently liked first
      select: {
        animal: {
          select: {
            id: true,
            name: true,
            city: true,
            birthDate: true,
            listingStatus: true,
            ...PET_CARD_TAG_SELECT,
            animalImages: {
              select: { url: true },
              orderBy: ANIMAL_IMAGE_ORDER,
              take: 1,
            },
          },
        },
      },
    });

    const pets: FavoritePet[] = likes.map((like) => ({
      ...like.animal,
      // This is the user's own like list, so every pet is liked by them.
      likes: [{ userId: personId }],
      isAvailable: AVAILABLE_STATUSES.includes(like.animal.listingStatus),
    }));

    // Available first (recency preserved), then unavailable (recency preserved).
    const available = pets.filter((p) => p.isAvailable);
    const unavailable = pets.filter((p) => !p.isAvailable);

    return { pets: [...available, ...unavailable] };
  } catch (error) {
    console.error("Error fetching favorite pets.", error);
    throw new Error("Error fetching favorite pets.");
  }
};

export const fetchPublicPagePetById = async (id: string) => {
  // Validate the id at runtime
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid Pet ID format.");
  }
  // Pet ID is valid, extract the data
  const validatedId = parsedId.data;

  const session = await getCachedSession();
  const personId = session?.user?.personId;

  try {
    const pet = await prisma.animal.findUnique({
      where: {
        id: validatedId,
        listingStatus: {
          in: [
            AnimalListingStatus.PUBLISHED,
            AnimalListingStatus.PENDING_ADOPTION,
          ],
        },
      },
      select: {
        id: true,
        name: true,
        listingStatus: true,
        city: true,
        state: true,
        birthDate: true,
        currentWeightGrams: true,
        heightCm: true,
        description: true,
        animalImages: {
          orderBy: ANIMAL_IMAGE_ORDER,
        },
        sex: true,
        size: true,
        isSpayedNeutered: true,
        // Server-side only: mapped to the `hasMicrochip` boolean below and
        // never included in what this function returns. Same contract as
        // fetchSpotlightAnimals — the detail page only needs to know whether
        // to show the "Microchipped" pill, not the number itself.
        microchipNumber: true,
        species: {
          select: {
            name: true,
          },
        },
        breeds: {
          where: { deletedAt: null },
          select: {
            name: true,
          },
        },
        primaryColor: {
          select: {
            name: true,
          },
        },
        colors: {
          where: { deletedAt: null },
          select: {
            name: true,
          },
        },
        characteristics: {
          where: {
            deletedAt: null,
          },
          select: {
            name: true,
          },
        },
        // Conditionally include likes if userId is available
        ...(personId && {
          likes: {
            where: {
              userId: personId,
            },
            select: {
              id: true,
            },
            take: 1,
          },
        }),
        // Conditionally include adoption application status if userId is available
        ...(personId && {
          adoptionApplications: {
            where: {
              applicantId: personId,
            },
            select: {
              id: true,
              applicantId: true,
              status: true,
            },
            take: 1,
          },
        }),
      },
    });

    if (!pet) {
      return null;
    }

    const { microchipNumber, ...rest } = pet;
    return { ...rest, hasMicrochip: microchipNumber !== null };
  } catch (error) {
    console.error("Error fetching pet.", error);
    throw new Error("Error fetching pet.");
  }
};

export const fetchLatestPublicAnimals = async (take: number = 4) => {
  const session = await getCachedSession();
  const personId = session?.user?.personId;

  // use prisma to get the latest pets
  try {
    const latestPets = await prisma.animal.findMany({
      where: {
        listingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        birthDate: true,
        city: true,
        ...PET_CARD_TAG_SELECT,
        animalImages: {
          select: {
            url: true,
          },
          orderBy: ANIMAL_IMAGE_ORDER,
          take: 1,
        },
        ...(personId && {
          likes: {
            select: {
              userId: true,
            },
            where: {
              userId: personId,
            },
            take: 1,
          },
        }),
      },
      orderBy: {
        createdAt: "desc",
      },
      take,
    });
    return latestPets;
  } catch (error) {
    console.error("Error fetching latest pets.", error);
    throw new Error("Error fetching latest pets.");
  }
};
/**
 * One animal as the homepage hero renders it. Everything is pre-formatted here
 * so the hero stays a presentational client component.
 *
 * Every field except `id` and `name` is optional in practice: a candidate can
 * reach the hero with no description, no weight and no badge, and the hero must
 * render that as a normal state rather than an error.
 */
export type SpotlightAnimal = {
  id: string;
  name: string;
  breedString: string; // joined breed names, or "Mixed breed"
  ageString: string | null;
  city: string | null;
  description: string | null;
  weightGrams: number | null;
  isSpayedNeutered: boolean;
  /** Derived from `microchipNumber`. The number itself never leaves the server. */
  hasMicrochip: boolean;
  /** Days of the current open stay. Null when the animal is not in care. */
  waitingDays: number | null;
  imageUrl: string | null;
  /**
   * Whether the signed-in user has already liked this animal. Resolved here
   * rather than in the hero because the hero's "Save to favorites" control is
   * `LikeButton`, which toggles: handed a hardcoded `false` it would silently
   * UNLIKE an animal the user had already saved.
   */
  isLikedByCurrentUser: boolean;
};

/** Hero plus its five thumbnails. */
const SPOTLIGHT_COUNT = 6;

/**
 * The longest-waiting published animals, for the homepage hero and its
 * thumbnail row.
 *
 * "Waiting" is the length of the animal's CURRENT stay, derived by pairing
 * intake and outcome events through `computeStays` — never read off
 * `listingStatus`, which is about public visibility, not physical presence.
 *
 * This deliberately does NOT call `_fetchAnimalStayEvents`: that helper is a
 * private building block for permission-wrapped report fetchers, and it selects
 * every animal regardless of listing status. This is an unauthenticated public
 * read, so the PUBLISHED filter has to live in the query itself.
 *
 * PENDING_ADOPTION animals are excluded — someone already has an application in
 * on them, so featuring them as the animal who has waited longest is misleading.
 */
export const fetchSpotlightAnimals = async (): Promise<SpotlightAnimal[]> => {
  const session = await getCachedSession();
  const personId = session?.user?.personId;

  try {
    // PERF: this walks every published animal's full intake/outcome history in
    // memory (O(animals)), mirroring _fetchLengthOfStaySummary's approach.
    // Acceptable at current shelter scale. Optimization candidate: a rollup or
    // stay table is the cleaner win than a narrower fetch here, since "longest
    // current stay" can't be expressed as an orderBy over the event rows.
    const animals = await prisma.animal.findMany({
      where: { listingStatus: AnimalListingStatus.PUBLISHED },
      select: {
        id: true,
        name: true,
        birthDate: true,
        city: true,
        description: true,
        currentWeightGrams: true,
        isSpayedNeutered: true,
        // Server-side only: mapped to the `hasMicrochip` boolean below and
        // never included in what this function returns.
        microchipNumber: true,
        publishedAt: true,
        breeds: { where: { deletedAt: null }, select: { name: true } },
        animalImages: {
          select: { url: true },
          orderBy: ANIMAL_IMAGE_ORDER,
          take: 1,
        },
        intake: { select: { intakeDate: true } },
        Outcome: { select: { outcomeDate: true } },
        ...(personId && {
          likes: {
            select: { userId: true },
            where: { userId: personId },
            take: 1,
          },
        }),
      },
    });

    const now = new Date();

    const withStay = animals.map((animal) => {
      const events: StayEvent[] = [
        ...animal.intake.map(
          (intake): StayEvent => ({ kind: "intake", date: intake.intakeDate }),
        ),
        ...animal.Outcome.map(
          (outcome): StayEvent => ({
            kind: "outcome",
            date: outcome.outcomeDate,
          }),
        ),
      ];
      // currentStayDays is null unless the last stay is still open, which is
      // exactly the `waitingDays` contract.
      const { isInCare, currentStayDays } = computeStays(events, now);
      return { animal, isInCare, currentStayDays };
    });

    const longestWaiting = withStay
      .filter((row) => row.isInCare)
      .sort((a, b) => (b.currentStayDays ?? 0) - (a.currentStayDays ?? 0))
      .slice(0, SPOTLIGHT_COUNT);

    // Top up from published animals that are NOT in care — an animal whose
    // outcome has been recorded but whose listing hasn't been archived yet, or
    // a backfilled seed animal with no intake history at all. They carry no
    // waiting count, because there is no open stay to measure.
    const shortfall = SPOTLIGHT_COUNT - longestWaiting.length;
    const topUp =
      shortfall > 0
        ? withStay
            .filter((row) => !row.isInCare)
            .sort((a, b) => {
              // Longest-listed first; a null publishedAt sorts last.
              const aTime = a.animal.publishedAt?.getTime() ?? Infinity;
              const bTime = b.animal.publishedAt?.getTime() ?? Infinity;
              return aTime === bTime ? 0 : aTime - bTime;
            })
            .slice(0, shortfall)
        : [];

    return [...longestWaiting, ...topUp].map(({ animal, currentStayDays }) => ({
      id: animal.id,
      name: animal.name,
      breedString:
        animal.breeds.map((breed) => breed.name).join(", ") || "Mixed breed",
      ageString: calculateAgeString({
        birthDate: animal.birthDate,
        simple: true,
      }),
      city: animal.city,
      description: animal.description,
      weightGrams: animal.currentWeightGrams,
      isSpayedNeutered: animal.isSpayedNeutered,
      hasMicrochip: animal.microchipNumber !== null,
      waitingDays: currentStayDays,
      imageUrl: animal.animalImages[0]?.url ?? null,
      isLikedByCurrentUser: (animal.likes?.length ?? 0) > 0,
    }));
  } catch (error) {
    console.error("Error fetching spotlight animals.", error);
    throw new Error("Error fetching spotlight animals.");
  }
};

/**
 * How many animals are publicly listed as available. Feeds the homepage's
 * "+N / Everyone" circle and its "{n} animals" line, so it counts PUBLISHED
 * only — the same set the hero draws from.
 */
export const fetchAvailableAnimalCount = async (): Promise<number> => {
  try {
    return await prisma.animal.count({
      where: { listingStatus: AnimalListingStatus.PUBLISHED },
    });
  } catch (error) {
    console.error("Error fetching available animal count.", error);
    throw new Error("Error fetching available animal count.");
  }
};
