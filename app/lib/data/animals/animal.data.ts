import { prisma } from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  Sex,
  Prisma,
} from "@prisma/client";
import {
  AnimalsPayload,
  SpeciesPayload,
  ColorPayload,
  PartnerPayload,
  AnimalIntakeFormPayload,
  AnimalSectionCardPayload,
  AnimalReIntakeFormPayload,
} from "../../types";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { DashboardAnimalsSchema } from "../../zod-schemas/animal.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";

// data for the animals table in the dashboard
const _fetchAnimals = async (
  queryInput: string,
  currentPageInput: number,
  listingStatusInput: string | undefined,
  sexInput: string | undefined,
  pageSizeInput: number,
  sortInput: string | undefined
): Promise<{ animals: AnimalsPayload[]; totalPages: number; totalRows: number}> => {
  // Parse the query and currentPage
  const validatedArgs = DashboardAnimalsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    listingStatus: listingStatusInput,
    sex: sexInput,
    pageSize: pageSizeInput,
    sort: sortInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching animals.");
  }
  const { query, currentPage, listingStatus, sex, pageSize, sort } =
    validatedArgs.data;

  const orderBy: Prisma.AnimalOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
  })();

  // Calculate the number of records to skip based on the current page
  // Dynamically build the 'where' clause for Prisma
  const whereClause: Prisma.AnimalWhereInput = {
    name: { contains: query, mode: "insensitive" },
    ...(listingStatus && {
      listingStatus: { in: listingStatus.split(",") as AnimalListingStatus[] },
    }),
    ...(sex && { sex: { in: sex.split(",") as Sex[] } }),
  };

  try {
    const offset = (currentPage - 1) * pageSize;

    const [totalCount, animals] = await prisma.$transaction([
      prisma.animal.count({ where: whereClause }),
      prisma.animal.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          birthDate: true,
          city: true,
          state: true,
          listingStatus: true,
          sex: true,
          size: true,
        },
        orderBy: orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return { animals, totalPages, totalRows: totalCount};
  } catch (error) {
    console.error("Error fetching animals.", error);
    throw new Error("Error fetching animals.");
  }
};

const _fetchSectionCardsAnimalData = async (
  id: string
): Promise<AnimalSectionCardPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }

  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: {
        id: true,
        name: true,
        birthDate: true,
        sex: true,
        size: true,
        microchipNumber: true,
        listingStatus: true,
        isSpayedNeutered: true,
        city: true,
        state: true,
        healthStatus: true,
        legalStatus: true,
        animalImages: {
          select: {
            url: true,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 1,
        },
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
          take: 1,
        },
        adoptionApplications: {
          select: {
            status: true,
          },
        },
        intake: {
          select: {
            intakeDate: true,
          },
          orderBy: {
            intakeDate: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            likes: true,
            tasks: {
              where: {
                status: {
                  in: ["TODO", "IN_PROGRESS"],
                },
              },
            },
          },
        },
      },
    });

    return animal;
  } catch (error) {
    console.error("Error fetching animal by ID.", error);
    throw new Error("Error fetching animal details.");
  }
};

const _fetchAnimalById = async (
  id: string
): Promise<AnimalIntakeFormPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }

  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: {
        id: true,
        name: true,
        birthDate: true,
        sex: true,
        weightKg: true,
        heightCm: true,
        city: true,
        state: true,
        description: true,
        listingStatus: true,
        microchipNumber: true,
        healthStatus: true,
        speciesId: true,
        breeds: {
          select: {
            id: true,
          },
        },
        colors: {
          select: {
            id: true,
          },
        },
      },
    });
    return animal;
  } catch (error) {
    console.error("Error fetching animal data.", error);
    throw new Error("Error fetching animal data.");
  }
};

const _fetchPartners = async (): Promise<PartnerPayload[]> => {
  try {
    const partners = await prisma.partner.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    return partners;
  } catch (error) {
    console.error("Error fetching partners.", error);
    throw new Error("Error fetching partners.");
  }
};

export const fetchColors = async (): Promise<ColorPayload[]> => {
  try {
    const colors = await prisma.color.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    return colors;
  } catch (error) {
    console.error("Error fetching colors.", error);
    throw new Error("Error fetching colors.");
  }
};

export const fetchSpecies = async (): Promise<SpeciesPayload[]> => {
  try {
    const species = await prisma.species.findMany({
      select: {
        id: true,
        name: true,
        breeds: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
    return species;
  } catch (error) {
    console.error("Error fetching species.", error);
    throw new Error("Error fetching species.");
  }
};

const _fetchAnimalForPhotoPage = async (id: string) => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }
  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: {
        id: true,
        name: true,
        animalImages: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
    return animal;
  } catch (error) {
    console.error("Error fetching animal for photos page.", error);
    throw new Error("Error fetching animal photo data.");
  }
};

const _fetchAnimalForOutcomeForm = async (id: string) => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }
  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: {
        id: true,
        name: true,
        listingStatus: true,
      },
    });
    return animal;
  } catch (error) {
    console.error("Error fetching animal for outcome form.", error);
    throw new Error("Error fetching animal data for outcome.");
  }
};

const _fetchAnimalForReIntake = async (id: string): Promise<AnimalReIntakeFormPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }
  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: validatedAnimalId },
      select: {
        id: true,
        name: true,
        listingStatus: true,
      },
    });
    return animal;
  } catch (error) {
    console.error("Error fetching animal for re-intake form.", error);
    throw new Error("Error fetching animal data for re-intake.");
  }
};

export const fetchAnimalForReIntake = RequirePermission(
  Permissions.ANIMAL_READ_DETAIL
)(_fetchAnimalForReIntake);

export const fetchAnimalForOutcomeForm = RequirePermission(
  Permissions.ANIMAL_READ_DETAIL
)(_fetchAnimalForOutcomeForm);

export const fetchAnimalForPhotosPage = RequirePermission(
  Permissions.ANIMAL_UPDATE
)(_fetchAnimalForPhotoPage);

export const fetchPartners = RequirePermission(Permissions.PARTNER_READ)(
  _fetchPartners
);

export const fetchAnimals = RequirePermission(Permissions.ANIMAL_READ_LISTING)(
  _fetchAnimals
);

export const fetchAnimalById = RequirePermission(
  Permissions.ANIMAL_READ_DETAIL
)(_fetchAnimalById);

export const fetchSectionCardsAnimalData = RequirePermission(Permissions.ANIMAL_READ_DETAIL)(
  _fetchSectionCardsAnimalData
);
