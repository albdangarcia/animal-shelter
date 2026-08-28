import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalHealthStatus,
  AnimalListingStatus,
  OutcomeType,
} from "@/prisma/generated/enums";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../auth/protected-actions";
import { Prettify } from "../utils/type-utils";

export type PetCardDataType = {
  totalPets: number;
  adoptedPetsCount: number;
  pendingPetsCount: number;
  publishedPetsCount: number;
  todoTasksCount: number;
  trends: {
    totalPetsChange: number;
    adoptedPetsChange: number;
    publishedPetsChange: number;
    todoTasksChange: number;
  };
};

const _fetchAnimalCardData = async (): Promise<PetCardDataType> => {
  try {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Current totals
    const [
      totalPets,
      adoptedPetsCount,
      pendingPetsCount,
      publishedPetsCount,
      todoTasksCount,
    ] = await Promise.all([
      prisma.animal.count(),
      prisma.outcome.count({
        where: {
          type: OutcomeType.ADOPTION,
        },
      }),
      prisma.animal.count({
        where: {
          listingStatus: AnimalListingStatus.PENDING_ADOPTION,
        },
      }),
      prisma.animal.count({
        where: {
          listingStatus: AnimalListingStatus.PUBLISHED,
        },
      }),
      prisma.task.count({
        where: {
          status: "TODO",
        },
      }),
    ]);

    // Current month counts (for trend calculation)
    const [
      currentMonthAnimals,
      currentMonthAdoptions,
      currentMonthPublished,
      currentMonthTasks,
    ] = await Promise.all([
      prisma.animal.count({
        where: {
          createdAt: {
            gte: startOfCurrentMonth,
          },
        },
      }),
      prisma.outcome.count({
        where: {
          type: OutcomeType.ADOPTION,
          outcomeDate: {
            gte: startOfCurrentMonth,
          },
        },
      }),
      prisma.animal.count({
        where: {
          publishedAt: {
            gte: startOfCurrentMonth,
          },
        },
      }),
      prisma.task.count({
        where: {
          status: "TODO",
          createdAt: {
            gte: startOfCurrentMonth,
          },
        },
      }),
    ]);

    // Last month counts (for comparison)
    const [
      lastMonthAnimals,
      lastMonthAdoptions,
      lastMonthPublished,
      lastMonthTasks,
    ] = await Promise.all([
      prisma.animal.count({
        where: {
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      prisma.outcome.count({
        where: {
          type: OutcomeType.ADOPTION,
          outcomeDate: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      prisma.animal.count({
        where: {
          publishedAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      prisma.task.count({
        where: {
          status: "TODO",
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
    ]);

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      totalPets,
      adoptedPetsCount,
      pendingPetsCount,
      publishedPetsCount,
      todoTasksCount,
      trends: {
        totalPetsChange: calculateChange(currentMonthAnimals, lastMonthAnimals),
        adoptedPetsChange: calculateChange(
          currentMonthAdoptions,
          lastMonthAdoptions,
        ),
        publishedPetsChange: calculateChange(
          currentMonthPublished,
          lastMonthPublished,
        ),
        todoTasksChange: calculateChange(currentMonthTasks, lastMonthTasks),
      },
    };
  } catch (error) {
    console.error("Error fetching card data.", error);
    throw new Error("Error fetching card data.");
  }
};

export type ChartDataPoint = {
  date: string;
  intakes: number;
  outcomes: number;
};

export type ChartData = ChartDataPoint[];

const _fetchChartData = async (): Promise<ChartData> => {
  try {
    const days = 90;

    const now = new Date();
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - days,
      ),
    );

    const [intakeData, outcomeData] = await Promise.all([
      prisma.intake.findMany({
        where: { intakeDate: { gte: startDate } },
        select: { intakeDate: true },
      }),
      prisma.outcome.findMany({
        where: { outcomeDate: { gte: startDate } },
        select: { outcomeDate: true },
      }),
    ]);

    // intakeDate/outcomeDate are full timestamps, so events on the same
    // calendar day rarely share an exact value. Bucket by day in JS instead
    // of using a DB-level groupBy, which would group by exact timestamp and
    // undercount days with multiple events.
    const countByDay = (dates: Date[]) => {
      const map = new Map<string, number>();
      for (const date of dates) {
        const key = date.toISOString().split("T")[0];
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return map;
    };

    const intakeMap = countByDay(intakeData.map((item) => item.intakeDate));
    const outcomeMap = countByDay(outcomeData.map((item) => item.outcomeDate));

    const chartData = Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + i);
      const dateString = date.toISOString().split("T")[0];

      return {
        date: dateString,
        intakes: intakeMap.get(dateString) || 0,
        outcomes: outcomeMap.get(dateString) || 0,
      };
    });

    return chartData;
  } catch (error) {
    console.error("Error fetching chart data.", error);
    throw new Error("Error fetching chart data.");
  }
};

export type TaskAnalyticsPayload = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    details: true;
    status: true;
    priority: true;
    category: true;
    dueDate: true;
    animal: { select: { id: true; name: true } };
    assignee: { select: { id: true; name: true } };
    medicationLog: {
      select: {
        id: true;
        schedule: { select: { medicationName: true } };
      };
    };
    createdBy: { select: { id: true; name: true } };
    createdAt: true;
    updatedAt: true;
  };
}>;

const _fetchAnalyticsTaskTableData = async (): Promise<
  TaskAnalyticsPayload[]
> => {
  try {
    const tasks = await prisma.task.findMany({
      // Filter for tasks that are not yet completed
      where: {
        status: {
          in: ["TODO", "IN_PROGRESS"],
        },
      },
      // Limit the result to 10 records
      take: 10,
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      select: {
        id: true,
        title: true,
        details: true,
        status: true,
        priority: true,
        category: true,
        dueDate: true,
        animal: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        medicationLog: {
          select: {
            id: true,
            schedule: { select: { medicationName: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    return tasks;
  } catch (error) {
    console.error("Error fetching task table data.", error);
    throw new Error("Error fetching task table data.");
  }
};

type AnimalForAttentionQueryPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    healthStatus: true;
    intake: {
      select: {
        intakeDate: true;
      };
      take: 1;
    };
  };
}>;

export type AnimalsRequiringAttentionPayload = Prettify<
  Omit<AnimalForAttentionQueryPayload, "intake"> & {
    intakeDate: Date;
  }
>;

// Health-status-only; backs the dashboard health table. Not dead code and not
// superseded by `fetchAttentionQueue` in `animals/attention-queue.data.ts` —
// that one is a work queue (task/health/foster signals, each clears when acted
// on) and a different shape. The two are deliberate siblings (D14).
const _fetchAnimalsRequiringAttention = async (): Promise<
  AnimalsRequiringAttentionPayload[]
> => {
  try {
    const animals = await prisma.animal.findMany({
      where: {
        healthStatus: {
          not: AnimalHealthStatus.HEALTHY,
        },
      },
      take: 10,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        healthStatus: true,
        intake: {
          select: {
            intakeDate: true,
          },
          orderBy: {
            intakeDate: "asc",
          },
          take: 1,
        },
      },
    });

    return animals
      .filter((animal) => animal.intake.length > 0)
      .map((animal) => ({
        id: animal.id,
        name: animal.name,
        healthStatus: animal.healthStatus,
        intakeDate: animal.intake[0].intakeDate,
      }));
  } catch (error) {
    console.error("Error fetching animals requiring attention data.", error);
    throw new Error("Error fetching animals requiring attention data.");
  }
};

export const fetchAnalyticsTaskTableData = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchAnalyticsTaskTableData);

export const fetchPetCardData = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchAnimalCardData);

export const fetchChartData = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchChartData);

export const fetchAnimalsRequiringAttention = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchAnimalsRequiringAttention);
