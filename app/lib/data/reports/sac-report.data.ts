import prisma from "@/app/lib/prisma";
import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveSacMonth, type SacReport } from "@/app/lib/utils/sac-report";
import { querySacReport } from "./sac-report-query";

/**
 * The Shelter Animals Count monthly report for the `month` URL param
 * (`yyyy-MM`), last month when it is missing or not a month. Counted by
 * `querySacReport` against the shelter's state.
 */
const _fetchSacReport = async (month?: string): Promise<SacReport> => {
  try {
    const [settings, today] = await Promise.all([
      getShelterSettings(),
      getShelterToday(),
    ]);
    return await querySacReport(prisma, {
      month: resolveSacMonth(month, today),
      shelterState: settings.state,
    });
  } catch (error) {
    console.error("Error fetching the Shelter Animals Count report.", error);
    throw new Error("Error fetching the Shelter Animals Count report.");
  }
};

export const fetchSacReport = RequirePermission(AppPermissions.REPORTS_READ)(
  _fetchSacReport,
);
