import { prisma } from "../prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  AdoptionApplicationPayload,
  MyApplicationPayload,
  AnimalForApplicationPayload,
} from "../types";
import { MyApplicationsSchema } from "../zod-schemas/animal.schemas";
import { AnimalListingStatus, ApplicationStatus, Prisma } from "@prisma/client";
import { RequirePermission, SessionUser, withAuthenticatedUser } from "../auth/protected-actions";
import { Permissions } from "../auth/permissions";

const _fetchMyApplications = async (
  user: SessionUser,
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number
): Promise<{
  myApplications: MyApplicationPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const personId = user.personId;

  const validatedArgs = MyApplicationsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    status: statusInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching applications.");
  }
  const { query, currentPage, sort, status, pageSize } = validatedArgs.data;
  const offset = (currentPage - 1) * pageSize;

  const orderBy: Prisma.AdoptionApplicationOrderByWithRelationInput = (() => {
    if (!sort) return { submittedAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "animalName":
        return { animal: { name: dir } };
      case "status":
        return { status: dir };
      case "submittedAt":
        return { submittedAt: dir };
      default:
        return { submittedAt: "desc" };
    }
  })();

  const whereClause: Prisma.AdoptionApplicationWhereInput = {
    userId: personId,
    animal: {
      name: {
        contains: query,
        mode: "insensitive" as const,
      },
    },
  };

  if (status) {
    const statuses = status.split(",") as ApplicationStatus[];
    whereClause.status = { in: statuses };
  }

  try {
    const [count, myApplications] = await prisma.$transaction([
      prisma.adoptionApplication.count({ where: whereClause }),
      prisma.adoptionApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          applicantName: true,
          applicantPhone: true,
          animal: {
            select: {
              id: true,
              name: true,
              species: {
                select: {
                  name: true,
                },
              },
              animalImages: {
                select: {
                  url: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(count / pageSize);

    return { myApplications, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching applications.", error);
    throw new Error("Error fetching applications.");
  }
};

const _fetchMyAppById = async (
  user: SessionUser,
  adoptionAppId: string // Adoption Application id from route params
): Promise<AdoptionApplicationPayload | null> => {
  const personId = user.personId;

  // Validate the adoptionAppId at runtime
  const parsedAdoptionAppId = cuidSchema.safeParse(adoptionAppId);

  if (!parsedAdoptionAppId.success) {
    throw new Error("Invalid Application ID format.");
  }
  const validatedAdoptionAppId = parsedAdoptionAppId.data;

  // Get the application by id, ensuring it belongs to the logged-in user
  try {
    const myApplication = await prisma.adoptionApplication.findFirst({
      where: {
        id: validatedAdoptionAppId,
        userId: personId,
      },
      include: {
        animal: {
          select: {
            id: true,
            name: true,
            breeds: {
              select: {
                name: true,
              },
            },
            species: {
              select: {
                name: true,
              },
            },
            adoptionApplications: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    return myApplication;
  } catch (error) {
    console.error("Error fetching Application.", error);
    throw new Error("Error fetching application.");
  }
};

// Fetch the animal information the user is trying to adopt (for edit/create application form)
const _getAnimalForApplication = async (
  user: SessionUser,
  animalId: string
): Promise<AnimalForApplicationPayload | null> => {
  const personId = user.personId;

  // Validate the animalId
  const parsedId = cuidSchema.safeParse(animalId);

  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }
  const validatedAnimalId = parsedId.data;

  try {
    const animal = await prisma.animal.findFirst({
      where: {
        id: validatedAnimalId,
        listingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        breeds: {
          select: {
            name: true,
          },
        },
        species: {
          select: {
            name: true,
          },
        },
        adoptionApplications: {
          where: {
            userId: personId,
          },
          select: {
            userId: true,
          },
        },
      },
    });

    return animal;
  } catch (error) {
    console.error("Error fetching animal for application:", error);
    throw new Error("Failed to fetch animal information for application.");
  }
};

export type ApplicantDefaultsPayload = Prisma.PersonGetPayload<{
  select: {
    name: true;
    email: true;
    phone: true;
    address: true;
    city: true;
    state: true;
    zipCode: true;
    householdProfile: {
      select: {
        livingSituation: true;
        hasYard: true;
        landlordPermission: true;
        householdSize: true;
        hasChildren: true;
        childrenAges: true;
        otherAnimalsDescription: true;
        animalExperience: true;
      };
    };
  };
}>;

const _fetchApplicantDefaults = async (
  user: SessionUser
): Promise<ApplicantDefaultsPayload | null> => {
  try {
    const person = await prisma.person.findUnique({
      where: { id: user.personId },
      select: {
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        householdProfile: {
          select: {
            livingSituation: true,
            hasYard: true,
            landlordPermission: true,
            householdSize: true,
            hasChildren: true,
            childrenAges: true,
            otherAnimalsDescription: true,
            animalExperience: true,
          },
        },
      },
    });

    return person;
  } catch (error) {
    console.error("Error fetching applicant defaults.", error);
    throw new Error("Error fetching applicant defaults.");
  }
};

export const fetchApplicantDefaults = withAuthenticatedUser(
  RequirePermission(Permissions.MY_APPLICATIONS_CREATE)(_fetchApplicantDefaults)
);

export const fetchMyApplications = withAuthenticatedUser(_fetchMyApplications);
export const fetchMyAppById = withAuthenticatedUser(_fetchMyAppById);
export const getAnimalForApplication = withAuthenticatedUser(
  _getAnimalForApplication
);
