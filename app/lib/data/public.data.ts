import { auth } from "@/auth";
import { AnimalListingStatus, AnimalSize, Sex } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { PublishedPetsSchema } from "../zod-schemas/animal.schemas";

export type PetsPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    city: true;
    state: true;
    birthDate: true;
    listingStatus: true;
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

  const session = await auth();
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
    const [totalCount, pets] = await prisma.$transaction([
      prisma.animal.count({ where: whereClause }),
      prisma.animal.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          birthDate: true,
          animalImages: {
            select: {
              url: true,
            },
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
  const session = await auth();
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
            animalImages: {
              select: { url: true },
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

  const session = await auth();
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
        weightKg: true,
        heightCm: true,
        description: true,
        animalImages: true,
        sex: true,
        size: true,
        isSpayedNeutered: true,
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

    return pet;
  } catch (error) {
    console.error("Error fetching pet.", error);
    throw new Error("Error fetching pet.");
  }
};

export const fetchLatestPublicAnimals = async () => {
  const session = await auth();
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
        animalImages: {
          select: {
            url: true,
          },
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
      take: 4,
    });
    return latestPets;
  } catch (error) {
    console.error("Error fetching latest pets.", error);
    throw new Error("Error fetching latest pets.");
  }
};