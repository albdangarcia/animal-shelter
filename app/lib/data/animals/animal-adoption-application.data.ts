import { Permissions } from "@/app/lib/auth/permissions";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { RequirePermission } from "../../auth/protected-actions";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import z from "zod";
import { ApplicationWithAnimal } from "../user-application.data";

export const fetchAnimalApplicationsSchema = z.object({
  animalId: cuidSchema,
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
  pageSize: pageSizeSchema,
});

const _fetchAnimalApplications = async (
  animalIdInput: string,
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  applications: ApplicationWithAnimal[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = fetchAnimalApplicationsSchema.safeParse({
    animalId: animalIdInput,
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    status: statusInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid input provided.");
  }

  const { animalId, query, currentPage, sort, status, pageSize } =
    validatedArgs.data;
  const offset = (currentPage - 1) * pageSize;

  const orderBy: Prisma.AdoptionApplicationOrderByWithRelationInput = (() => {
    if (!sort) return { submittedAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "applicantName":
        return { applicantName: dir };
      case "applicantEmail":
        return { applicantEmail: dir };
      case "applicantPhone":
        return { applicantPhone: dir };
      case "status":
        return { status: dir };
      case "animalName":
        return { animal: { name: dir } };
      case "animalSpecies":
        return { animal: { species: { name: dir } } };
      case "submittedAt":
        return { submittedAt: dir };
      default:
        return { submittedAt: "desc" };
    }
  })();

  const whereClause: Prisma.AdoptionApplicationWhereInput = {
    animalId: animalId,
    ...(query && {
      applicantName: {
        contains: query,
        mode: "insensitive",
      },
    }),
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
    const [applications, count] = await prisma.$transaction([
      prisma.adoptionApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          applicantName: true,
          applicantEmail: true,
          applicantPhone: true,
          applicantCity: true,
          applicantState: true,
          status: true,
          submittedAt: true,
          animal: {
            select: {
              id: true,
              name: true,
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

    return { applications, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching animal applications.", error);
    throw new Error("Error fetching animal applications.");
  }
};

export const fetchAnimalApplications = RequirePermission(
  Permissions.APPLICATIONS_READ_DETAIL,
)(_fetchAnimalApplications);
