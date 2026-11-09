import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getShelterNow, getShelterSettings } from "./shelter-settings.data";
import type { CalendarDay } from "../utils/shelter-day";
import type { DoseSlotEnds } from "../utils/medication-slots";
import {
  doseSheetDay,
  doseSheetView,
  findDoseSheet,
  type DoseSheetViewSection,
} from "./medication-doses";

export type {
  DoseSheetViewGroup,
  DoseSheetViewRow,
  DoseSheetViewSection,
} from "./medication-doses";

export interface DoseSheetPage {
  sections: DoseSheetViewSection[];
  /** The day shown. */
  day: CalendarDay;
  today: CalendarDay;
  /** The earliest day the sheet goes back to. */
  earliest: CalendarDay;
  /** Whether the day asked for was out of range, so today is shown. */
  refused: boolean;
  /** The shelter's clock as the page was read: the dose form starts from
   * it. */
  time: string;
  /** When each slot ends, for its heading. */
  ends: DoseSlotEnds;
}

const _fetchDoseSheet = async (
  // A list when the URL repeats `day`.
  dayParam: string | string[] | undefined,
): Promise<DoseSheetPage> => {
  try {
    // One reading of the time: the day shown, and which of its slots have
    // ended.
    const [{ today, clock }, { doseSlotEnds, timezone }] = await Promise.all([
      getShelterNow(),
      getShelterSettings(),
    ]);
    const { day, earliest, refused } = doseSheetDay(dayParam, today);
    const orders = await findDoseSheet(prisma, day);
    return {
      sections: doseSheetView(orders, day, { today, clock }, doseSlotEnds, timezone),
      day,
      today,
      earliest,
      refused,
      time: clock.time,
      ends: doseSlotEnds,
    };
  } catch (error) {
    console.error("Failed to fetch the dose sheet:", error);
    throw new Error("Could not fetch the dose sheet.");
  }
};

/** The shelter's medication slots for a day, by slot and by where each animal
 * is. */
export const fetchDoseSheet = RequirePermission(AppPermissions.MEDICAL_READ)(
  _fetchDoseSheet,
);
