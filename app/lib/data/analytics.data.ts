import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import type { CareEpisodeType } from "@/prisma/generated/enums";
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
import type { ApplicationsWaiting } from "../utils/applications-waiting";
import { countHeadcounts, type Headcounts } from "./animals/headcounts";
import {
  countAdoptionApplicationsWaiting,
  countFosterApplicationsWaiting,
} from "./applications-waiting";
import { findReadinessForAnimals } from "./animals/readiness";
import { shelterDay } from "./animals/readiness.data";
import {
  summariseReadiness,
  type ReadinessSummary,
} from "../readiness/summary";
import {
  countOpenCareEpisodesByType,
  findOpenCareEpisodes,
  type UnderCareRow,
} from "./care-episodes";

// The dashboard's headcount cards: the animals in care by the shelter board's
// buckets, available and pending adoption, and how full the units are.
const _fetchHeadcounts = async (): Promise<Headcounts> => {
  try {
    return await countHeadcounts(prisma);
  } catch (error) {
    console.error("Error fetching the headcounts.", error);
    throw new Error("Error fetching the headcounts.");
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

/** What the dashboard's headcount cards need: `ANIMAL_READ_ANALYTICS`, the
 *  dashboard's own permission. The cards check this same list before they
 *  fetch. */
export const HEADCOUNT_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
] as const satisfies readonly AppPermission[];

export const fetchHeadcounts = RequireAllPermissions(
  ...HEADCOUNT_PERMISSIONS,
)(_fetchHeadcounts);

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

// The dashboard's "Applications waiting" card, one count per kind, each gated
// by the list it links to. Today and the timezone are the shelter's, so the
// oldest's age is counted on its calendar.
const waitingOptions = async () => ({
  today: await getShelterToday(),
  timezone: (await getShelterSettings()).timezone,
});

const _fetchAdoptionApplicationsWaiting =
  async (): Promise<ApplicationsWaiting> => {
    try {
      return await countAdoptionApplicationsWaiting(
        prisma,
        await waitingOptions(),
      );
    } catch (error) {
      console.error("Error fetching adoption applications waiting.", error);
      throw new Error("Error fetching adoption applications waiting.");
    }
  };

const _fetchFosterApplicationsWaiting =
  async (): Promise<ApplicationsWaiting> => {
    try {
      return await countFosterApplicationsWaiting(
        prisma,
        await waitingOptions(),
      );
    } catch (error) {
      console.error("Error fetching foster applications waiting.", error);
      throw new Error("Error fetching foster applications waiting.");
    }
  };

/** What the card's adoption line needs: the dashboard's permission and
 *  `APPLICATIONS_READ`, the adoption list's. The card checks this same list
 *  before it fetches, and leaves the line out without it. */
export const ADOPTION_APPLICATIONS_WAITING_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.APPLICATIONS_READ,
] as const satisfies readonly AppPermission[];

export const fetchAdoptionApplicationsWaiting = RequireAllPermissions(
  ...ADOPTION_APPLICATIONS_WAITING_PERMISSIONS,
)(_fetchAdoptionApplicationsWaiting);

/** What the card's foster line needs: the dashboard's permission and
 *  `FOSTERS_READ`, the foster application list's. */
export const FOSTER_APPLICATIONS_WAITING_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.FOSTERS_READ,
] as const satisfies readonly AppPermission[];

export const fetchFosterApplicationsWaiting = RequireAllPermissions(
  ...FOSTER_APPLICATIONS_WAITING_PERMISSIONS,
)(_fetchFosterApplicationsWaiting);

// The dashboard's "Readiness" card: the readiness board summed up. The same
// read the board makes (every non-archived animal, judged on the shelter's
// day) and the board's own builder, so the card's numbers are the board's.
const _fetchReadinessSummary = async (): Promise<ReadinessSummary> => {
  try {
    const day = await shelterDay();
    const readiness = await findReadinessForAnimals(prisma, day);
    return summariseReadiness(readiness, new Date(), day.timezone);
  } catch (error) {
    console.error("Error fetching the readiness summary.", error);
    throw new Error("Error fetching the readiness summary.");
  }
};

/** What the card needs: the dashboard's permission and the four reads
 *  readiness is judged from (as `fetchReadinessForAnimals` requires). The
 *  card checks this same list before it fetches, and is left out without
 *  it. */
export const READINESS_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.MEDICAL_READ,
] as const satisfies readonly AppPermission[];

export const fetchReadinessSummary = RequireAllPermissions(
  ...READINESS_PERMISSIONS,
)(_fetchReadinessSummary);
