import { Prisma, OutcomeType } from "@prisma/client";
import { z } from "zod";
import {
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import { prisma } from "../../prisma";
import { RequirePermission } from "../../auth/protected-actions";
import { Permissions } from "../../auth/permissions";

// Zod schema for validating the search parameters
export const OutcomesSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  type: z.string().optional(),
  pageSize: pageSizeSchema,
});

export const _fetchOutcomeById = async (outcomeId: string) => {
  try {
    const outcome = await prisma.outcome.findUnique({
      where: {
        id: outcomeId,
      },
      include: {
        animal: {
          select: {
            id: true,
            name: true,
          },
        },
        staffMember: {
          select: {
            id: true,
            name: true,
          },
        },
        destinationPartner: {
          select: {
            id: true,
            name: true,
          },
        },
        adoptionApplication: {
          include: {
            animal: {
              select: {
                id: true,
                name: true,
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
                adoptionApplications: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return outcome;
  } catch (error) {
    console.error("Database Error: Failed to fetch outcome.", error);
    throw new Error("Failed to fetch outcome.");
  }
};

export type OutcomeWithDetails = Prisma.OutcomeGetPayload<{
  include: {
    animal: {
      select: { id: true; name: true; species: { select: { name: true } } };
    };
    staffMember: {
      select: { id: true; name: true };
    };
    destinationPartner: {
      select: { id: true; name: true };
    };
    owner: {
      select: { id: true; name: true };
    };
    adoptionApplication: {
      select: { id: true; applicantName: true };
    };
  };
}>;

export const _fetchOutcomes = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  typeInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  outcomes: OutcomeWithDetails[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = OutcomesSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    type: typeInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching outcomes.");
  }

  const { query, currentPage, sort, type, pageSize } = validatedArgs.data;

  const orderBy: Prisma.OutcomeOrderByWithRelationInput = (() => {
    if (!sort) return { outcomeDate: "desc" };

    const [id, dir] = sort.split(".");
    // Sanitize the direction to ensure it's always 'asc' or 'desc'.
    const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

    if (id === "staffMember") {
      return { staffMember: { name: direction } };
    }
    if (id === "animal") {
      return { animal: { name: direction } };
    }
    if (id === "date") {
      return { outcomeDate: direction };
    }

    // This handles top-level fields like 'outcomeDate', 'type', etc.
    return { [id]: direction };
  })();

  const whereClause: Prisma.OutcomeWhereInput = {
    // Add filtering by outcome type if provided
    ...(type && {
      type: { in: type.split(",") as OutcomeType[] },
    }),
    // Add searching across multiple relevant fields if a query is provided
    ...(query && {
      OR: [
        { animal: { name: { contains: query, mode: "insensitive" } } },
        { staffMember: { name: { contains: query, mode: "insensitive" } } },
        {
          adoptionApplication: {
            applicantName: { contains: query, mode: "insensitive" },
          },
        },
        { owner: { name: { contains: query, mode: "insensitive" } } },
        {
          destinationPartner: {
            name: { contains: query, mode: "insensitive" },
          },
        },
      ],
    }),
  };

  try {
    const offset = (currentPage - 1) * pageSize;
    const [totalCount, outcomes] = await prisma.$transaction([
      prisma.outcome.count({ where: whereClause }),
      prisma.outcome.findMany({
        where: whereClause,
        include: {
          animal: {
            select: {
              id: true,
              name: true,
              species: { select: { name: true } },
            },
          },
          staffMember: { select: { id: true, name: true } },
          destinationPartner: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          adoptionApplication: { select: { id: true, applicantName: true } },
        },
        orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);
    return { outcomes, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Database Error: Failed to fetch outcomes.", error);
    throw new Error("Failed to fetch outcomes.");
  }
};

export const fetchOutcomeById = RequirePermission(
  Permissions.OUTCOMES_READ_DETAIL,
)(_fetchOutcomeById);

export const fetchOutcomes = RequirePermission(
  Permissions.OUTCOMES_READ_LISTING,
)(_fetchOutcomes);
