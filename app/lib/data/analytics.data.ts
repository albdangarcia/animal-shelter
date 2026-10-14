import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalListingStatus,
  OutcomeType,
} from "@/prisma/generated/enums";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  RequireAllPermissions,
  RequirePermission,
} from "../auth/protected-actions";
import {
  calendarDay,
  countByShelterDay,
  shiftDayKey,
} from "../utils/shelter-day";
import { resolveDashboardMonthBoundaries } from "./dashboard-month-boundaries";
import { findOpenCareEpisodes, type UnderCareRow } from "./care-episodes";

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
    const [today, settings] = await Promise.all([
      getShelterToday(),
      getShelterSettings(),
    ]);
    const {
      currentMonthFromDay,
      lastMonthFromDay,
      lastMonthToDay,
      startOfCurrentMonth,
      startOfLastMonth,
    } = resolveDashboardMonthBoundaries(today, settings.timezone);

    // Current totals
    const [
      totalPets,
      adoptedPetsCount,
      pendingPetsCount,
      publishedPetsCount,
      todoTasksCount,
    ] = await Promise.all([
      prisma.animal.count(),
      // A reversed outcome was recorded in error, so none of these counts it.
      prisma.outcome.count({
        where: {
          type: OutcomeType.ADOPTION,
          reversedAt: null,
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
          reversedAt: null,
          outcomeDate: {
            gte: currentMonthFromDay,
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
            lt: startOfCurrentMonth,
          },
        },
      }),
      prisma.outcome.count({
        where: {
          type: OutcomeType.ADOPTION,
          reversedAt: null,
          outcomeDate: {
            gte: lastMonthFromDay,
            lte: lastMonthToDay,
          },
        },
      }),
      prisma.animal.count({
        where: {
          publishedAt: {
            gte: startOfLastMonth,
            lt: startOfCurrentMonth,
          },
        },
      }),
      prisma.task.count({
        where: {
          status: "TODO",
          createdAt: {
            gte: startOfLastMonth,
            lt: startOfCurrentMonth,
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

    // The chart's unit is the calendar day, the same day the reports count in,
    // and each axis label is one day. It ends on today, so an outcome recorded
    // today shows.
    const startKey = shiftDayKey(await getShelterToday(), -(days - 1));

    const [intakeData, outcomeData] = await Promise.all([
      prisma.intake.findMany({
        where: { intakeDate: { gte: startKey } },
        select: { intakeDate: true },
      }),
      prisma.outcome.findMany({
        where: { outcomeDate: { gte: startKey }, reversedAt: null },
        select: { outcomeDate: true },
      }),
    ]);

    const intakeMap = countByShelterDay(
      intakeData.map((item) => calendarDay(item.intakeDate)),
    );
    const outcomeMap = countByShelterDay(
      outcomeData.map((item) => calendarDay(item.outcomeDate)),
    );

    const chartData = Array.from({ length: days }, (_, i) => {
      const dateString = shiftDayKey(startKey, i);

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

export type AnimalUnderCarePayload = UnderCareRow;

// The dashboard's "Animal Health" tab: animals in care under an open care
// episode, the latest start first. Not the attention queue's care signal
// (`findUnplannedCareForQueue`), which keeps only the animals with nothing
// planned and clears when someone plans something.
const _fetchAnimalsUnderCare = async (): Promise<AnimalUnderCarePayload[]> => {
  try {
    return await findOpenCareEpisodes(prisma, { take: 10 });
  } catch (error) {
    console.error("Error fetching animals under care.", error);
    throw new Error("Error fetching animals under care.");
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

/** `ANIMAL_READ_ANALYTICS` for the dashboard, and `MEDICAL_READ`: the rows
 *  are read from the medical record. */
export const fetchAnimalsUnderCare = RequireAllPermissions(
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.MEDICAL_READ,
)(_fetchAnimalsUnderCare);
