import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { Permissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import z from "zod";

export type PersonAdoptionApplicationPayload =
  Prisma.AdoptionApplicationGetPayload<{
    select: {
      id: true;
      status: true;
      submittedAt: true;
      updatedAt: true;
      animal: {
        select: {
          id: true;
          name: true;
          species: { select: { name: true } };
          animalImages: {
            select: { url: true };
            orderBy: { createdAt: "asc" };
            take: 1;
          };
        };
      };
    };
  }>;

const PersonAdoptionApplicationsSchema = z.object({
  currentPage: currentPageSchema,
  personId: cuidSchema,
});

const APPLICATIONS_PER_PAGE = 10;

const _fetchPersonAdoptionApplications = async (
  currentPageInput: number,
  inputPersonId: string,
): Promise<{
  applications: PersonAdoptionApplicationPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = PersonAdoptionApplicationsSchema.safeParse({
    currentPage: currentPageInput,
    personId: inputPersonId,
  });

  if (!validatedArgs.success) {
    throw new Error(
      "Invalid arguments for fetching person adoption applications.",
    );
  }

  const { currentPage, personId } = validatedArgs.data;

  const whereClause: Prisma.AdoptionApplicationWhereInput = {
    userId: personId,
  };

  try {
    const offset = (currentPage - 1) * APPLICATIONS_PER_PAGE;

    const [totalCount, applications] = await prisma.$transaction([
      prisma.adoptionApplication.count({ where: whereClause }),
      prisma.adoptionApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          animal: {
            select: {
              id: true,
              name: true,
              species: { select: { name: true } },
              animalImages: {
                select: { url: true },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          submittedAt: "desc",
        },
        take: APPLICATIONS_PER_PAGE,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / APPLICATIONS_PER_PAGE);
    return { applications, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Error fetching person adoption applications.", error);
    throw new Error("Could not fetch person adoption applications.");
  }
};

export const fetchPersonAdoptionApplications = RequirePermission(
  Permissions.PERSONS_READ_DETAIL,
)(_fetchPersonAdoptionApplications);
