import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import z from "zod";
import {
  ACTIVITIES_PER_PAGE,
  animalActivityLogPageArgs,
} from "./animal-activity-page";

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
