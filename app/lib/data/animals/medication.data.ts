import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { MedicationFrequency, type DoseSlot } from "@/prisma/generated/enums";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { getShelterNow, getShelterSettings } from "../shelter-settings.data";
import type { CalendarDay } from "../../utils/shelter-day";
import { defaultStart } from "../../utils/medication-slots";
import { findAnimalMedications } from "./medication";
import {
  findMedicationOrderChoices,
  type MedicationOrderChoices,
} from "../medical-catalog";
import {
  medicationsView,
  todaysDoses,
  type MedicationsView,
  type MedicationViewContext,
  type TodaysDoseRow,
} from "./medication-view";

export type { AnimalMedicationOrder } from "./medication";
export type { MedicationOrderChoices } from "../medical-catalog";
export type {
  DayView,
  DoseCounts,
  DoseView,
  MedicationsView,
  OrderSummary,
  OrderView,
  RunDayView,
  SlotView,
  TodaysDoseRow,
} from "./medication-view";

const parseAnimalId = (animalId: string) => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) {
    throw new Error("Invalid animal ID format.");
  }
  return parsed.data;
};

/** The shelter's time, dose times and zone, read once for a page. */
const viewContext = async (
  names: Record<string, string>,
): Promise<MedicationViewContext> => {
  const [{ today, clock }, { doseSlotEnds, timezone }] = await Promise.all([
    getShelterNow(),
    getShelterSettings(),
  ]);
  return { today, clock, ends: doseSlotEnds, timezone, names };
};

export interface MedicationsPage extends MedicationsView {
  animalName: string;
  /** Names for the ids the orders' change histories hold, keyed by id. */
  names: Record<string, string>;
  today: CalendarDay;
  /** The shelter's clock as the page was read: the dose form starts from
   * it. */
  time: string;
}

const _fetchMedicationsPage = async (animalId: string): Promise<MedicationsPage> => {
  const id = parseAnimalId(animalId);
  try {
    const [animal, { today, clock }] = await Promise.all([
      prisma.animal.findUniqueOrThrow({ where: { id }, select: { name: true } }),
      getShelterNow(),
    ]);
    // Every dose: a past order lists its whole run.
    const medications = await findAnimalMedications(prisma, id, { toDay: today });
    const context = await viewContext(medications.names);
    return {
      animalName: animal.name,
      ...medicationsView(medications, context),
      names: medications.names,
      today,
      time: clock.time,
    };
  } catch (error) {
    console.error("Failed to fetch medication orders:", error);
    throw new Error("Could not fetch the medication orders.");
  }
};

export const fetchMedicationsPage = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchMedicationsPage);

/** Overview's "Today's doses": null when there is nothing to show. */
export interface TodaysDoses {
  rows: TodaysDoseRow[];
  names: Record<string, string>;
  today: CalendarDay;
  /** The shelter's clock as the page was read. */
  time: string;
}

const _fetchTodaysDoses = async (animalId: string): Promise<TodaysDoses | null> => {
  const id = parseAnimalId(animalId);
  try {
    const { today, clock } = await getShelterNow();
    const medications = await findAnimalMedications(prisma, id, {
      fromDay: today,
      toDay: today,
    });
    const rows = todaysDoses(medications, await viewContext(medications.names));
    return rows && { rows, names: medications.names, today, time: clock.time };
  } catch (error) {
    console.error("Failed to fetch today's doses:", error);
    throw new Error("Could not fetch today's doses.");
  }
};

export const fetchTodaysDoses = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchTodaysDoses);

/** What the order form offers: the medications, and where a new order of
 * each frequency starts by default, worked out on the shelter's clock. */
export interface MedicationOrderFormOptions extends MedicationOrderChoices {
  defaultStarts: Record<
    MedicationFrequency,
    { startDate: CalendarDay; firstSlot: DoseSlot | null }
  >;
  today: CalendarDay;
}

const _fetchMedicationOrderFormOptions = async (
  animalId: string,
): Promise<MedicationOrderFormOptions> => {
  const id = parseAnimalId(animalId);
  try {
    const [choices, { today, clock }, { doseSlotEnds }] = await Promise.all([
      findMedicationOrderChoices(prisma, id),
      getShelterNow(),
      getShelterSettings(),
    ]);
    const defaultStarts = Object.fromEntries(
      Object.values(MedicationFrequency).map((frequency) => [
        frequency,
        defaultStart(frequency, clock, doseSlotEnds),
      ]),
    ) as MedicationOrderFormOptions["defaultStarts"];
    return { ...choices, defaultStarts, today };
  } catch (error) {
    console.error("Failed to fetch the medication order form's options:", error);
    throw new Error("Could not fetch the medication order form's options.");
  }
};

// Only those who order medications need what the order form offers.
export const fetchMedicationOrderFormOptions = RequirePermission(
  AppPermissions.MEDICAL_MANAGE,
)(_fetchMedicationOrderFormOptions);
