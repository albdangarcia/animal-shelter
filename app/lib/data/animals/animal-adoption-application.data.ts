import { AppPermissions } from "@/app/lib/auth/permissions";
import type { Prisma } from "@/prisma/generated/client";
import {
  inPageOrder,
  pageApplicationsByEffectiveStatus,
} from "../application-status.data";
import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../../auth/protected-actions";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import z from "zod";
import { AdoptionApplicationWithAnimal } from "../user-adoption-application.data";

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
  applications: AdoptionApplicationWithAnimal[];
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

  const [sortField, sortDirection] = sort?.split(".") ?? [];
  const dir = sortDirection === "asc" ? "asc" : "desc";
  // Status is derived, not a column the database can sort by, so a status
  // sort is applied after the derivation instead of here.
  const statusSort = sortField === "status" ? dir : undefined;

  const orderBy: Prisma.AdoptionApplicationOrderByWithRelationInput = (() => {
    switch (sortField) {
      case "applicantName":
        return { applicantName: dir };
      case "applicantEmail":
        return { applicantEmail: dir };
      case "applicantPhone":
        return { applicantPhone: dir };
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
    });

    return {
      applications: inPageOrder(rows, page),
      totalPages: Math.ceil(page.totalRows / pageSize),
      totalRows: page.totalRows,
    };
  } catch (error) {
    console.error("Error fetching animal applications.", error);
    throw new Error("Error fetching animal applications.");
  }
};

export const fetchAnimalApplications = RequirePermission(
  AppPermissions.APPLICATIONS_READ,
)(_fetchAnimalApplications);
