import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { medicalEntryKindsParam } from "../zod-schemas/medical-entry.schemas";
import { getShelterToday } from "./shelter-settings.data";
import type { CalendarDay } from "../utils/shelter-day";
import type { MedicalEntryKind } from "@/prisma/generated/enums";
import {
  UPCOMING_DAYS,
  findMedicalDue,
  groupMedicalDue,
  type MedicalDueGroup,
} from "./medical-due";

export type {
  MedicalDueEntry,
  MedicalDueGroup,
  MedicalDueListRow,
} from "./medical-due";

const _fetchMedicalDue = async (
  // A list when the URL repeats `kind`.
  kindInput: string | string[] | undefined,
): Promise<{
  groups: MedicalDueGroup[];
  today: CalendarDay;
  /** The kinds the list is filtered to; none means every kind. */
  kinds: MedicalEntryKind[];
}> => {
  const kinds = medicalEntryKindsParam.parse(kindInput);
  try {
    const today = await getShelterToday();
    const rows = await findMedicalDue(prisma, today, {
      upcomingDays: UPCOMING_DAYS,
      kinds,
    });
    return { groups: groupMedicalDue(rows, today), today, kinds };
  } catch (error) {
    console.error("Failed to fetch the medical due list:", error);
    throw new Error("Could not fetch the medical due list.");
  }
};

/** Scheduled care across the shelter, overdue to a week ahead, grouped by
 * where each animal is. */
export const fetchMedicalDue = RequirePermission(AppPermissions.MEDICAL_READ)(
  _fetchMedicalDue,
);
