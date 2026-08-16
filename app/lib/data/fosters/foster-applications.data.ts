import prisma from "@/app/lib/prisma";
import type { ApplicationStatus } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import z from "zod";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { MyFosterApplicationPayload } from "@/app/lib/types";

export type FosterApplicationListItem = Prisma.FosterApplicationGetPayload<{
  select: {
    id: true;
    applicantName: true;
    applicantEmail: true;
    applicantPhone: true;
    status: true;
    submittedAt: true;
    maxAnimals: true;
  };
}>;

const fetchFosterApplicationsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
  pageSize: pageSizeSchema,
});

const _fetchFosterApplications = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  fosterApplications: FosterApplicationListItem[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = fetchFosterApplicationsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    status: statusInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching foster applications.");
  }

  const { query, currentPage, sort, status, pageSize } = validatedArgs.data;
  const offset = (currentPage - 1) * pageSize;

  const orderBy: Prisma.FosterApplicationOrderByWithRelationInput = (() => {
    if (!sort) return { submittedAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "applicantName":
        return { applicantName: dir };
      case "status":
        return { status: dir };
      case "submittedAt":
        return { submittedAt: dir };
      default:
        return { submittedAt: "desc" };
    }
  })();

  const whereClause: Prisma.FosterApplicationWhereInput = {
    applicantName: {
      contains: query,
      mode: "insensitive",
    },
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
    const [fosterApplications, count] = await prisma.$transaction([
      prisma.fosterApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          applicantName: true,
          applicantEmail: true,
          applicantPhone: true,
          status: true,
          submittedAt: true,
          maxAnimals: true,
        },
        orderBy,
        take: pageSize,
        skip: offset,
      }),
      prisma.fosterApplication.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(count / pageSize);

    return { fosterApplications, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching foster applications.", error);
    throw new Error("Error fetching foster applications.");
  }
};

const _fetchFosterApplicationById = async (
  id: string,
): Promise<MyFosterApplicationPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid Foster Application ID format.");
  }

  try {
    const application = await prisma.fosterApplication.findUnique({
      where: { id: parsedId.data },
      include: {
        speciesCapabilities: { select: { id: true, name: true } },
        history: {
          orderBy: { changedAt: "desc" },
          include: { changedBy: { select: { name: true } } },
        },
      },
    });
    return application;
  } catch (error) {
    console.error("Error fetching foster application by ID.", error);
    throw new Error("Error fetching foster application by ID.");
  }
};

export const fetchFosterApplications = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFosterApplications);

export const fetchFosterApplicationById = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFosterApplicationById);
