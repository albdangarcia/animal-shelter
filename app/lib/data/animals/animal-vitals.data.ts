import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import z from "zod";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { latestVitalsEntryOrder } from "../../utils/vitals-order";

const VITALS_LOGS_PER_PAGE = 10;

export type AnimalVitalsListPayload = Prisma.VitalsLogGetPayload<{
  select: {
    id: true;
    recordedAt: true;
    weightGrams: true;
    temperatureC: true;
    bodyConditionScore: true;
    notes: true;
    deletedAt: true; // Needed for the "Show Deleted" filter logic
    recordedBy: {
      select: { name: true };
    };
  };
}>;

export const AnimalVitalsLogsSchema = z.object({
  currentPage: currentPageSchema,
  animalId: cuidSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
});

const _fetchAnimalVitalsLogs = async (
  animalId: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
): Promise<{
  vitalsLogs: AnimalVitalsListPayload[];
  totalPages: number;
}> => {
  const validatedArgs = AnimalVitalsLogsSchema.safeParse({
    currentPage: currentPageInput,
    animalId: animalId,
    sort: sortInput,
    status: statusInput,
  });
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching animal vitals logs.");
  }

  const { currentPage, sort, status } = validatedArgs.data;

  // Determine the sorting order, defaulting to newest first. Applies
  // latestVitalsEntryOrder (see app/lib/utils/vitals-order.ts) both to the
  // default order and to an explicit recordedAt sort — a user picking "Newest
  // First" must see the same entry on top that the cache considers current.
  const orderBy:
    | Prisma.VitalsLogOrderByWithRelationInput
    | Prisma.VitalsLogOrderByWithRelationInput[] = (() => {
    if (!sort) return latestVitalsEntryOrder("desc");

    const [id, dir] = sort.split(".");
    const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

    if (id === "recordedBy") {
      return { recordedBy: { name: direction } };
    }

    if (id === "recordedAt") {
      return latestVitalsEntryOrder(direction);
    }

    const sortableFields = new Set([
      "weightGrams",
      "temperatureC",
      "bodyConditionScore",
      "deletedAt",
    ]);
    if (sortableFields.has(id)) {
      return { [id]: direction };
    }

    return latestVitalsEntryOrder("desc");
  })();

  // Status filter: deleted entries show only when "deleted" is selected.
  // Default (nothing) and "active" only → active. Both → all.
  const selected = status ? status.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");

  let deletedFilter: Prisma.VitalsLogWhereInput = {};
  if (wantsDeleted && !wantsActive) {
    deletedFilter = { deletedAt: { not: null } }; // deleted only
  } else if (wantsActive && wantsDeleted) {
    deletedFilter = {}; // both → all
  } else {
    deletedFilter = { deletedAt: null }; // default & active-only → active
  }

  const whereClause: Prisma.VitalsLogWhereInput = {
    animalId: animalId,
    ...deletedFilter,
  };

  try {
    const offset = (currentPage - 1) * VITALS_LOGS_PER_PAGE;
    const [totalCount, vitalsLogs] = await Promise.all([
      prisma.vitalsLog.count({ where: whereClause }),
      prisma.vitalsLog.findMany({
        where: whereClause,
        select: {
          id: true,
          recordedAt: true,
          weightGrams: true,
          temperatureC: true,
          bodyConditionScore: true,
          notes: true,
          deletedAt: true,
          recordedBy: { select: { name: true } },
        },
        orderBy: orderBy,
        take: VITALS_LOGS_PER_PAGE,
        skip: offset,
      }),
    ]);
    const totalPages = Math.ceil(totalCount / VITALS_LOGS_PER_PAGE);
    return { vitalsLogs, totalPages };
  } catch (error) {
    console.error("Error fetching animal vitals logs:", error);
    throw new Error("Error fetching animal vitals logs.");
  }
};

export type AnimalVitalsFormPayload = Prisma.VitalsLogGetPayload<{
  select: {
    id: true;
    recordedAt: true;
    weightGrams: true;
    temperatureC: true;
    bodyConditionScore: true;
    notes: true;
  };
}>;

// Used by the create/edit form to infer which unit (g/kg or oz/lb) to
// pre-select in the weight toggle, based on the animal's last known weight.
const _fetchAnimalCurrentWeightGrams = async (
  animalId: string,
): Promise<number | null> => {
  try {
    const animal = await prisma.animal.findUnique({
      where: { id: animalId },
      select: { currentWeightGrams: true },
    });
    return animal?.currentWeightGrams ?? null;
  } catch (error) {
    console.error(
      `Error fetching current weight for animal ${animalId}:`,
      error,
    );
    throw new Error("Error fetching current weight.");
  }
};

export const fetchAnimalVitalsLogs = RequirePermission(
  AppPermissions.ANIMAL_VITALS_READ,
)(_fetchAnimalVitalsLogs);

export const fetchAnimalCurrentWeightGrams = RequirePermission(
  AppPermissions.ANIMAL_VITALS_READ,
)(_fetchAnimalCurrentWeightGrams);
