import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import z from "zod";

export type AnimalActivityLogPayload = Prisma.AnimalActivityLogGetPayload<{
  include: {
    changedBy: {
      include: {
        user: true;
      };
    };
  };
}>;

const AnimalActivityLogSchema = z.object({
  currentPage: currentPageSchema,
  animalId: cuidSchema,
});

const ACTIVITIES_PER_PAGE = 10;

const _fetchAnimalActivityLogs = async (
  currentPageInput: number,
  inputAnimalId: string
): Promise<{
  activityLogs: AnimalActivityLogPayload[];
  totalPages: number;
}> => {
  const validatedArgs = AnimalActivityLogSchema.safeParse({
    currentPage: currentPageInput,
    animalId: inputAnimalId,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching activity logs.");
  }

  const { currentPage, animalId } = validatedArgs.data;

  const whereClause: Prisma.AnimalActivityLogWhereInput = {
    animalId: animalId,
  };

  try {
    const offset = (currentPage - 1) * ACTIVITIES_PER_PAGE;

    const [totalCount, activityLogs] = await prisma.$transaction([
      prisma.animalActivityLog.count({ where: whereClause }),
      prisma.animalActivityLog.findMany({
        where: whereClause,
        include: {
          changedBy: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          changedAt: "desc",
        },
        take: ACTIVITIES_PER_PAGE,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / ACTIVITIES_PER_PAGE);
    return { activityLogs, totalPages };
  } catch (error) {
    console.error("Error fetching animal activity logs:", error);
    throw new Error("Could not fetch animal activity logs.");
  }
};

export const fetchAnimalActivityLogs = RequirePermission(
  AppPermissions.ANIMAL_ACTIVITY_READ
)(_fetchAnimalActivityLogs);
