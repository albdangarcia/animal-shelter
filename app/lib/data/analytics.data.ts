import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  OutcomeType,
  type CareEpisodeType,
} from "@/prisma/generated/enums";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
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
import {
  countOpenCareEpisodesByType,
  findOpenCareEpisodes,
  type UnderCareRow,
} from "./care-episodes";

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

export type UnderCareSummary = {
  /** Open episodes on animals in care, by type, uncapped. */
  countsByType: Record<CareEpisodeType, number>;
  /** The latest few, the latest start first. */
  latest: UnderCareRow[];
};

/** How many animals the "Under care" card lists by name. */
const UNDER_CARE_LATEST = 5;

// The dashboard's "Under care" card: animals in care under an open care
// episode, counted by type, and the latest few. Not the attention queue's care
// signal (`findUnplannedCareForQueue`), which keeps only the animals with
// nothing planned and clears when someone plans something.
const _fetchUnderCareSummary = async (): Promise<UnderCareSummary> => {
  try {
    const [countsByType, latest] = await Promise.all([
      countOpenCareEpisodesByType(prisma),
      findOpenCareEpisodes(prisma, { take: UNDER_CARE_LATEST }),
    ]);
    return { countsByType, latest };
  } catch (error) {
    console.error("Error fetching animals under care.", error);
    throw new Error("Error fetching animals under care.");
  }
};

export const fetchPetCardData = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchAnimalCardData);

export const fetchChartData = RequirePermission(
  AppPermissions.ANIMAL_READ_ANALYTICS,
)(_fetchChartData);

/** What the dashboard's "Under care" card needs: `ANIMAL_READ_ANALYTICS` for
 *  the dashboard, and `MEDICAL_READ`, since the rows are read from the
 *  medical record. The card checks this same list before it fetches. */
export const UNDER_CARE_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.MEDICAL_READ,
] as const satisfies readonly AppPermission[];

export const fetchUnderCareSummary = RequireAllPermissions(
  ...UNDER_CARE_PERMISSIONS,
)(_fetchUnderCareSummary);
