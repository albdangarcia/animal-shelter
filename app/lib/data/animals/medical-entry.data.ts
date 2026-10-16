import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema, currentPageSchema } from "../../zod-schemas/common.schemas";
import { medicalHistoryKindsParam } from "../../zod-schemas/medical-entry.schemas";
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
  type MedicalHistoryItem,
} from "./medical-entry";
import { findConditionEventNames } from "./medical-condition";
import {
  findMedicalStatus,
  type CurrentChip,
} from "./medical-status";
import type { SpayNeuterStatus } from "../../utils/spay-neuter";
import type { ExamFact } from "../../utils/exams";
import type { CareStatus } from "../../utils/care-status";
import { findCareStatus } from "./care-status";

export type { MedicalEntryDisplay, MedicalHistoryItem } from "./medical-entry";

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
  /** The latest exam done that isn't voided, of any type. */
  lastExam: ExamFact | null;
  /** The open care episode, allergies and live conditions, for the alerts. */
  care: CareStatus;
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
    const [latestRabies, status, care, animal, dueEntries, recentEntries] =
      await Promise.all([
        findLatestRabiesVaccine(prisma, id),
        findMedicalStatus(prisma, id, today),
        findCareStatus(prisma, [id], today),
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
      lastExam: status.lastExam,
      care: care.get(id)!,
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
  kinds: medicalHistoryKindsParam,
});

const _fetchMedicalHistory = async (
  animalId: string,
  currentPageInput: number,
  // A list when the URL repeats `kind`.
  kindInput: string | string[] | undefined,
): Promise<{
  animalName: string;
  items: MedicalHistoryItem[];
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
    const [animal, page] = await Promise.all([
      prisma.animal.findUniqueOrThrow({ where: { id }, select: { name: true } }),
      findMedicalHistoryPage(prisma, id, {
        kinds: args.data.kinds,
        page: args.data.currentPage,
        perPage: HISTORY_PER_PAGE,
        timeZone: timezone,
      }),
    ]);
    const pick = <S extends MedicalHistoryItem["source"]>(source: S) =>
      page.items.filter(
        (item): item is Extract<MedicalHistoryItem, { source: S }> =>
          item.source === source,
      );
    // Each table's events name their own kinds of record.
    const [entryNames, recordNames] = await Promise.all([
      findEventNames(prisma, pick("ENTRY").map((item) => item.entry)),
      findConditionEventNames(
        prisma,
        pick("CONDITION").map((item) => item.condition),
        pick("EPISODE").map((item) => item.episode),
      ),
    ]);
    return {
      animalName: animal.name,
      items: page.items,
      totalPages: page.totalPages,
      names: { ...entryNames, ...recordNames, ...page.orderNames },
      today,
    };
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
