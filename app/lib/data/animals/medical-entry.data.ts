import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema, currentPageSchema } from "../../zod-schemas/common.schemas";
import { medicalEntryKindsParam } from "../../zod-schemas/medical-entry.schemas";
import { getShelterSettings, getShelterToday } from "../shelter-settings.data";
import { rabiesStatus, type RabiesStatus } from "../../utils/medical-days";
import type { CalendarDay } from "../../utils/shelter-day";
import {
  MEDICAL_ENTRY_DISPLAY_SELECT,
  findDueMedicalEntries,
  findEventNames,
  findLatestRabiesVaccine,
  findMedicalHistoryPage,
  findRecentMedicalEntries,
  findVaccinesAndTests,
  type MedicalEntryDisplay,
} from "./medical-entry";
import {
  findMedicalStatus,
  type CurrentChip,
} from "./medical-status";
import type { SpayNeuterStatus } from "../../utils/spay-neuter";

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
  spayNeuter: SpayNeuterStatus;
  /** The chips the animal carries, newest first. */
  chips: CurrentChip[];
  currentWeightGrams: number | null;
  /** Scheduled care not given yet, soonest due first, overdue included. */
  dueEntries: MedicalEntryDisplay[];
  /**
   * The spay/neuter exemption open for review, if any. It is listed with the
   * due care, due on its review day.
   */
  reviewEntry: MedicalEntryDisplay | null;
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
    const today = await getShelterToday();
    const [latestRabies, status, animal, dueEntries, recentEntries] =
      await Promise.all([
        findLatestRabiesVaccine(prisma, id),
        findMedicalStatus(prisma, id, today),
        prisma.animal.findUnique({
          where: { id },
          select: { currentWeightGrams: true },
        }),
        findDueMedicalEntries(prisma, id),
        findRecentMedicalEntries(prisma, id, RECENT_ENTRIES),
      ]);
    const reviewEntry = status.exemptionReview
      ? await prisma.medicalEntry.findUnique({
          where: { id: status.exemptionReview.id },
          select: MEDICAL_ENTRY_DISPLAY_SELECT,
        })
      : null;
    return {
      rabies: rabiesStatus(latestRabies, today),
      spayNeuter: status.spayNeuter,
      chips: status.chips,
      currentWeightGrams: animal?.currentWeightGrams ?? null,
      dueEntries,
      reviewEntry,
      recentEntries,
      names: await findEventNames(prisma, [
        ...dueEntries,
        ...(reviewEntry ? [reviewEntry] : []),
        ...recentEntries,
      ]),
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
    const [{ timezone }, today] = await Promise.all([
      getShelterSettings(),
      getShelterToday(),
    ]);
    const page = await findMedicalHistoryPage(prisma, id, {
      kinds: args.data.kinds,
      page: args.data.currentPage,
      perPage: HISTORY_PER_PAGE,
      timeZone: timezone,
    });
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
