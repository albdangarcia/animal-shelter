import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../zod-schemas/common.schemas";
import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import z from "zod";
import type { ApplicationStatus } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";

export type AdoptionApplicationWithAnimal = Prisma.AdoptionApplicationGetPayload<{
  select: {
    id: true;
    applicantId: true;
    applicantName: true;
    applicantEmail: true;
    applicantPhone: true;
    applicantCity: true;
    applicantState: true;
    status: true;
    submittedAt: true;
    animal: {
      select: {
        id: true;
        name: true;
        species: {
          select: {
            name: true;
          };
        };
      };
    };
  };
}>;

export type AdoptionApplicationWithOutcome = Prisma.AdoptionApplicationGetPayload<{
  include: {
    animal: {
      select: {
        id: true;
        name: true;
        breeds: {
          select: {
            name: true;
          };
        };
        species: {
          select: {
            name: true;
          };
        };
        adoptionApplications: {
          select: {
            applicantId: true;
          };
        };
      };
    };
    outcome: {
      select: {
        id: true;
        outcomeDate: true;
      };
    };
    applicant: {
      select: {
        user: {
          select: {
            id: true;
          };
        };
      };
    };
  };
}>;

export const fetchUserAdoptionApplicationsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
  pageSize: pageSizeSchema,
});

const _fetchUserAdoptionApplications = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  userApplications: AdoptionApplicationWithAnimal[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = fetchUserAdoptionApplicationsSchema.safeParse({
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
      case "applicantName":
        return { applicantName: dir };
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
    OR: [
      {
        applicantName: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        animal: {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
    ],
  };

  if (status) {
    const statuses = status.split(",") as ApplicationStatus[];
    if (statuses.length > 1) {
      whereClause.status = { in: statuses };
    } else if (statuses.length === 1) {
      whereClause.status = statuses[0];
    }
  }

  try {
    const [userApplications, count] = await Promise.all([
      prisma.adoptionApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          applicantId: true,
          applicantName: true,
          applicantEmail: true,
          applicantPhone: true,
          applicantCity: true,
          applicantState: true,
          status: true,
          submittedAt: true,
          animal: {
            select: {
              name: true,
              id: true,
              species: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: orderBy,
        take: pageSize,
        skip: offset,
      }),
      prisma.adoptionApplication.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(count / pageSize);

    return { userApplications, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching user applications.", error);
    throw new Error("Error fetching user applications.");
  }
};

const _fetchAdoptionApplicationById = async (
  id: string,
): Promise<AdoptionApplicationWithOutcome | null> => {
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid Application ID format.");
  }
  const validatedId = parsedId.data;

  try {
    const application = await prisma.adoptionApplication.findUnique({
      where: {
        id: validatedId,
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
                applicantId: true,
              },
            },
          },
        },
        outcome: {
          select: {
            id: true,
            outcomeDate: true,
          },
        },
        applicant: {
          select: {
            user: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });
    return application;
  } catch (error) {
    console.error("Error fetching application by ID.", error);
    throw new Error("Error fetching application by ID.");
  }
};

export const fetchUserAdoptionApplications = RequirePermission(
  AppPermissions.APPLICATIONS_READ,
)(_fetchUserAdoptionApplications);

export const fetchAdoptionApplicationById = RequirePermission(
  AppPermissions.APPLICATIONS_READ,
)(_fetchAdoptionApplicationById);
