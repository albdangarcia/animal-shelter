import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema, currentPageSchema } from "../../zod-schemas/common.schemas";
import { medicalEntryKindsParam } from "../../zod-schemas/medical-entry.schemas";
import { getShelterToday } from "../shelter-settings.data";
import { rabiesStatus, type RabiesStatus } from "../../utils/medical-days";
import type { CalendarDay } from "../../utils/shelter-day";
import {
  findDueMedicalEntries,
  findEventNames,
  findLatestRabiesVaccine,
  findMedicalHistoryPage,
  findRecentMedicalEntries,
  findVaccinesAndTests,
  type MedicalEntryDisplay,
} from "./medical-entry";

export type { MedicalEntryDisplay } from "./medical-entry";

const RECENT_ENTRIES = 5;
const HISTORY_PER_PAGE = 10;

const parseAnimalId = (animalId: string) => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) {
    throw new Error("Invalid animal ID format.");
  }
  return parsed.data;
};

/** Names for the ids an entry's change history mentions, keyed by id. */
export type EventNames = Record<string, string>;

export interface MedicalOverview {
  rabies: RabiesStatus;
  currentWeightGrams: number | null;
  /** Scheduled care not given yet, soonest due first, overdue included. */
  dueEntries: MedicalEntryDisplay[];
  recentEntries: MedicalEntryDisplay[];
  names: EventNames;
  /** The shelter's today, which overdue and due today are counted against. */
  today: CalendarDay;
}

const _fetchMedicalOverview = async (
  animalId: string,
): Promise<MedicalOverview> => {
  const id = parseAnimalId(animalId);
  try {
    const [latestRabies, animal, dueEntries, recentEntries, today] =
      await Promise.all([
        findLatestRabiesVaccine(prisma, id),
        prisma.animal.findUnique({
          where: { id },
          select: { currentWeightGrams: true },
        }),
        findDueMedicalEntries(prisma, id),
        findRecentMedicalEntries(prisma, id, RECENT_ENTRIES),
        getShelterToday(),
      ]);
    return {
      rabies: rabiesStatus(latestRabies, today),
      currentWeightGrams: animal?.currentWeightGrams ?? null,
      dueEntries,
      recentEntries,
      names: await findEventNames(prisma, [...dueEntries, ...recentEntries]),
      today,
    };
  } catch (error) {
    console.error("Failed to fetch medical overview:", error);
    throw new Error("Could not fetch the medical overview.");
  }
};

export const fetchMedicalOverview = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchMedicalOverview);

const HistoryArgsSchema = z.object({
  currentPage: currentPageSchema,
  kinds: medicalEntryKindsParam,
});

const _fetchMedicalHistory = async (
  animalId: string,
  currentPageInput: number,
  // A list when the URL repeats `kind`.
  kindInput: string | string[] | undefined,
): Promise<{
  entries: MedicalEntryDisplay[];
  totalPages: number;
  names: EventNames;
  today: CalendarDay;
}> => {
  const id = parseAnimalId(animalId);
  const args = HistoryArgsSchema.safeParse({
    currentPage: currentPageInput,
    kinds: kindInput,
  });
  if (!args.success) {
    throw new Error("Invalid arguments for fetching medical history.");
  }
  try {
    const [page, today] = await Promise.all([
      findMedicalHistoryPage(prisma, id, {
        kinds: args.data.kinds,
        page: args.data.currentPage,
        perPage: HISTORY_PER_PAGE,
      }),
      getShelterToday(),
    ]);
    return { ...page, names: await findEventNames(prisma, page.entries), today };
  } catch (error) {
    console.error("Failed to fetch medical history:", error);
    throw new Error("Could not fetch the medical history.");
  }
};

export const fetchMedicalHistory = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchMedicalHistory);

const _fetchVaccinesAndTests = async (
  animalId: string,
): Promise<{
  entries: MedicalEntryDisplay[];
  names: EventNames;
  today: CalendarDay;
}> => {
  const id = parseAnimalId(animalId);
  try {
    const [entries, today] = await Promise.all([
      findVaccinesAndTests(prisma, id),
      getShelterToday(),
    ]);
    return { entries, names: await findEventNames(prisma, entries), today };
  } catch (error) {
    console.error("Failed to fetch vaccines and tests:", error);
    throw new Error("Could not fetch vaccines and tests.");
  }
};

export const fetchVaccinesAndTests = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchVaccinesAndTests);
