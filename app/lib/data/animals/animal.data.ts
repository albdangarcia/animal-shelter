import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  ApplicationStatus,
  IntakeType,
  type Sex,
} from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
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
import { searchQuerySchema } from "../../zod-schemas/common.schemas";
import { DashboardAnimalsSchema } from "../../zod-schemas/animal.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { LATEST_ENTRY_ORDER } from "../../utils/vitals-order";

// data for the animals table in the dashboard
const _fetchAnimals = async (
  queryInput: string,
  currentPageInput: number,
  listingStatusInput: string | undefined,
  sexInput: string | undefined,
  pageSizeInput: number,
  sortInput: string | undefined,
): Promise<{
  animals: AnimalsPayload[];
  totalPages: number;
  totalRows: number;
}> => {
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
    const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

    const sortableFields = new Set([
      "name",
      "birthDate",
      "city",
      "state",
      "listingStatus",
      "sex",
      "size",
      "createdAt",
    ]);
    if (sortableFields.has(id)) {
      return { [id]: direction };
    }

    return { createdAt: "desc" };
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

    return { animals, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Error fetching animals.", error);
    throw new Error("Error fetching animals.");
  }
};

// Gated by ANIMAL_INFO_READ alone, deliberately — this is a cross-domain summary
// card, not a domain detail view. It has always surfaced a slice of data that
// otherwise lives behind its own permission (open foster placements normally
// behind FOSTERS_READ, adoption application statuses behind APPLICATIONS_READ,
// an active-task count behind ANIMAL_TASK_READ); the per-domain READ permissions
// gate each one's dedicated tab, not the overview. The weight/vitals-trend field
// follows that same established pattern rather than requiring ANIMAL_VITALS_READ
// — keep it consistent with the fields beside it if this ever gets re-examined.
const _fetchSectionCardsAnimalData = async (
  id: string,
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
          where: {
            deletedAt: null,
          },
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
          where: {
            deletedAt: null,
          },
          select: {
            name: true,
          },
        },
        currentUnit: {
          select: {
            name: true,
            location: {
              select: {
                name: true,
              },
            },
          },
        },
        fosterPlacements: {
          where: { endDate: null },
          select: {
            id: true,
            type: true,
            startDate: true,
            expectedEndDate: true,
            fosterProfile: {
              select: { person: { select: { id: true, name: true } } },
            },
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
        vitalsLogs: {
          where: { deletedAt: null, weightGrams: { not: null } },
          select: { recordedAt: true, weightGrams: true },
          orderBy: LATEST_ENTRY_ORDER,
          take: 2,
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

/**
 * Selects currentWeightGrams and the last weigh-in date for read-only display on
 * the edit form (weight is not editable here — it's recorded on the Vitals tab).
 * This is a denormalized field on the animal row, not vitals history, so
 * ANIMAL_INFO_READ is the correct gate. Anything that surfaces actual VitalsLog
 * rows belongs behind ANIMAL_VITALS_READ.
 */
const _fetchAnimalById = async (
  id: string,
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
        size: true,
        currentWeightGrams: true,
        heightCm: true,
        city: true,
        state: true,
        description: true,
        listingStatus: true,
        microchipNumber: true,
        healthStatus: true,
        speciesId: true,
        primaryColorId: true,
        currentUnitId: true,
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
        // Only the timestamp — this is "as of when" for the cached weight above,
        // not vitals data. Adding measurement fields here would surface VitalsLog
        // content behind ANIMAL_INFO_READ; put those behind ANIMAL_VITALS_READ instead.
        vitalsLogs: {
          where: { deletedAt: null, weightGrams: { not: null } },
          select: { recordedAt: true },
          orderBy: LATEST_ENTRY_ORDER,
          take: 1,
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
            typicalSize: true,
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
        intake: {
          where: {
            type: IntakeType.OWNER_SURRENDER,
            surrenderingPersonId: { not: null },
          },
          orderBy: { intakeDate: "desc" },
          take: 1,
          select: {
            surrenderingPerson: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    return animal;
  } catch (error) {
    console.error("Error fetching animal for outcome form.", error);
    throw new Error("Error fetching animal data for outcome.");
  }
};

const _fetchAnimalForReIntake = async (
  id: string,
): Promise<AnimalReIntakeFormPayload | null> => {
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

export type AnimalSearchResult = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    species: { select: { name: true } };
    listingStatus: true;
  };
}>;

const _searchPublishedAnimals = async (
  query: string,
  excludePersonId?: string,
) => {
  const parsed = searchQuerySchema.safeParse(query);
  const q = parsed.success ? parsed.data : "";

  try {
    return await prisma.animal.findMany({
      where: {
        listingStatus: AnimalListingStatus.PUBLISHED,
        name: { contains: q, mode: "insensitive" },
        ...(excludePersonId && {
          NOT: {
            adoptionApplications: {
              some: {
                applicantId: excludePersonId,
                status: {
                  notIn: [
                    ApplicationStatus.REJECTED,
                    ApplicationStatus.WITHDRAWN,
                  ],
                },
              },
            },
          },
        }),
      },
      select: {
        id: true,
        name: true,
        species: { select: { name: true } },
        listingStatus: true,
      },
      take: 10,
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Error searching published animals.", error);
    throw new Error("Error searching animals.");
  }
};

export const searchPublishedAnimals = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_searchPublishedAnimals);

export const fetchAnimalForReIntake = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchAnimalForReIntake);

export const fetchAnimalForOutcomeForm = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchAnimalForOutcomeForm);

export const fetchAnimalForPhotosPage = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchAnimalForPhotoPage);

export const fetchPartners = RequirePermission(AppPermissions.PARTNERS_READ)(
  _fetchPartners,
);

export const fetchAnimals = RequirePermission(AppPermissions.ANIMAL_INFO_READ)(
  _fetchAnimals,
);

export const fetchAnimalById = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchAnimalById);

export const fetchSectionCardsAnimalData = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchSectionCardsAnimalData);
