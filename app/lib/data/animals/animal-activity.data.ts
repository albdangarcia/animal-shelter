import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
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

export const ACTIVITIES_PER_PAGE = 10;

// The where, order and paging of one feed page, without the auth wrapper, so
// a test can run the exact query the feed runs.
export const animalActivityLogPageArgs = (
  animalId: string,
  currentPage: number
) => ({
  where: { animalId } satisfies Prisma.AnimalActivityLogWhereInput,
  orderBy: [
    { changedAt: "desc" },
    // Only here so rows that share a changedAt land on exactly one page. It
    // does not order related rows; their writers stamp them apart.
    { id: "desc" },
  ] satisfies Prisma.AnimalActivityLogOrderByWithRelationInput[],
  take: ACTIVITIES_PER_PAGE,
  skip: (currentPage - 1) * ACTIVITIES_PER_PAGE,
});

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

  const pageArgs = animalActivityLogPageArgs(animalId, currentPage);

  try {
    const [totalCount, activityLogs] = await Promise.all([
      prisma.animalActivityLog.count({ where: pageArgs.where }),
      prisma.animalActivityLog.findMany({
        ...pageArgs,
        include: {
          changedBy: {
            include: {
              user: true,
            },
          },
        },
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
