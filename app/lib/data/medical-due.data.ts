import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { medicalEntryKindsParam } from "../zod-schemas/medical-entry.schemas";
import { getShelterToday } from "./shelter-settings.data";
import type { CalendarDay } from "../utils/shelter-day";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import {
  UPCOMING_DAYS,
  findExemptionReviewsDue,
  findMedicalDue,
  groupMedicalDue,
  type MedicalDueGroup,
} from "./medical-due";

export type {
  MedicalDueEntry,
  MedicalDueGroup,
  MedicalDueListRow,
  MedicalDueReviewRow,
  MedicalDueSectionRow,
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
    // An exemption up for review is about a surgery, so the Surgery filter
    // keeps it.
    const withReviews =
      kinds.length === 0 || kinds.includes(MedicalEntryKind.SURGERY);
    const [rows, reviews] = await Promise.all([
      findMedicalDue(prisma, today, { upcomingDays: UPCOMING_DAYS, kinds }),
      withReviews
        ? findExemptionReviewsDue(prisma, today, { upcomingDays: UPCOMING_DAYS })
        : [],
    ]);
    return { groups: groupMedicalDue(rows, today, reviews), today, kinds };
  } catch (error) {
    console.error("Failed to fetch the medical due list:", error);
    throw new Error("Could not fetch the medical due list.");
  }
};

/** Scheduled care across the shelter, and spay/neuter exemptions up for
 * review, overdue to a week ahead, grouped by where each animal is. */
export const fetchMedicalDue = RequirePermission(AppPermissions.MEDICAL_READ)(
  _fetchMedicalDue,
);
