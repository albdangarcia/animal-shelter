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
import type { Prisma } from "@/prisma/generated/client";
import type { StatusHistoryEntry } from "@/app/lib/types";
import type {
  EffectiveApplicationStatus,
  WithEffectiveStatus,
} from "../utils/derive-application-status";
import {
  inPageOrder,
  pageApplicationsByEffectiveStatus,
  withConsequenceInHistory,
} from "./application-status.data";

// Both shapes below carry the application's effective status in `status`,
// derived from the animal's outcomes, not the column's value.
export type AdoptionApplicationWithAnimal = WithEffectiveStatus<
  Prisma.AdoptionApplicationGetPayload<{
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
  }>
>;

// `history` also ends with the outcome that adopted or closed the application,
// if one did (`withConsequenceInHistory`).
export type AdoptionApplicationWithOutcome = Omit<
  Prisma.AdoptionApplicationGetPayload<{
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
              id: true;
            };
          };
        };
      };
      outcomes: {
        select: {
          id: true;
          outcomeDate: true;
        };
      };
      lastEditedBy: {
        select: { name: true };
      };
      history: {
        orderBy: { changedAt: "desc" };
        include: {
          changedBy: {
            select: { name: true };
          };
        };
      };
    };
  }>,
  "status" | "history"
> & { status: EffectiveApplicationStatus; history: StatusHistoryEntry[] };

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

  const [sortField, sortDirection] = sort?.split(".") ?? [];
  const dir = sortDirection === "asc" ? "asc" : "desc";
  // Status is derived, not a column the database can sort by, so a status
  // sort is applied after the derivation instead of here.
  const statusSort = sortField === "status" ? dir : undefined;

  const orderBy: Prisma.AdoptionApplicationOrderByWithRelationInput = (() => {
    switch (sortField) {
      case "applicantName":
        return { applicantName: dir };
      case "animalName":
        return { animal: { name: dir } };
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

  try {
    const page = await pageApplicationsByEffectiveStatus({
      where: whereClause,
      orderBy,
      statuses: status ? status.split(",") : [],
      statusSort,
      offset,
      pageSize,
    });
    const rows = await prisma.adoptionApplication.findMany({
      where: { id: { in: page.ids } },
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
    });

    return {
      userApplications: inPageOrder(rows, page),
      totalPages: Math.ceil(page.totalRows / pageSize),
      totalRows: page.totalRows,
    };
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
    return null;
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
                id: true,
              },
            },
          },
        },
        // The adoption outcomes linked to this application, newest first. A
        // reversed one keeps its link, so there can be several, and at most
        // one that is not reversed.
        outcomes: {
          select: {
            id: true,
            outcomeDate: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
        // Who last rewrote the snapshot. The review screen shows it beside
        // `lastEditedAt` so a reviewer can see the text moved after they read
        // it; the column is null until someone edits, which is the common case.
        lastEditedBy: { select: { name: true } },
        history: {
          orderBy: { changedAt: "desc" },
          include: { changedBy: { select: { name: true } } },
        },
      },
    });
    return application && (await withConsequenceInHistory(application));
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
