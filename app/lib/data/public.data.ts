import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { AnimalListingStatus, Prisma } from "@prisma/client";
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

export const fetchPublishedPets = async (
  queryInput: string,
  currentPageInput: number,
  speciesNameInput?: string
): Promise<{ pets: PetsPayload[]; totalPages: number }> => {
  const validatedArgs = PublishedPetsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    speciesName: speciesNameInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching pets.");
  }
  const { query, currentPage, speciesName } = validatedArgs.data;

  const session = await auth();
  const personId = session?.user?.personId;

  const whereClause: Prisma.AnimalWhereInput = {
    name: {
      contains: query,
      mode: "insensitive",
    },
    listingStatus: {
      in: [AnimalListingStatus.PUBLISHED, AnimalListingStatus.PENDING_ADOPTION],
    },
    ...(speciesName && {
      species: {
        name: speciesName,
      },
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
        orderBy: {
          createdAt: "desc",
        },
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
    const species = await prisma.species.findMany();
    return species;
  } catch (error) {
    console.error("Error fetching species.", error);
    throw new Error("Error fetching species.");
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
          select: {
            name: true,
          },
        },
        colors: {
          select: {
            name: true,
          },
        },
        characteristics: {
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
              userId: personId,
            },
            select: {
              id: true,
              userId: true,
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
