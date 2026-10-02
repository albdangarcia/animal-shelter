import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { resolveReportRange } from "@/app/lib/utils/report-date-utils";
import {
  summarizeLengthOfStay,
  type LengthOfStayStats,
} from "@/app/lib/utils/length-of-stay";
import { _fetchAnimalStayEvents, parseSpeciesIds } from "./report-shared.data";

export type LengthOfStayReport = LengthOfStayStats & {
  fromLabel: string;
  toLabel: string;
};

/**
 * Length-of-stay statistics for the selected range and species filter.
 *
 * DELIBERATE ASYMMETRY (decision record): the median/max/histogram cover only
 * completed stays whose outcome fell inside the selected period (the compliance
 * framing), while the in-care worklist and its counts are always "as of now",
 * independent of the range. This is intentional — do NOT filter the worklist to
 * the range to make them symmetric.
 *
 * In-care status is derived purely from the intake/outcome pairing
 * ([[stay-utils]]), never from `listingStatus`, so animals that are DRAFT or
 * ARCHIVED but physically present still count.
 *
 * The arithmetic is `summarizeLengthOfStay` ([[length-of-stay]]).
 */
const _fetchLengthOfStayReport = async (
  from?: string,
  to?: string,
  species?: string,
): Promise<LengthOfStayReport> => {
  try {
    const today = await getShelterToday();
    const range = resolveReportRange(from, to, today);
    const speciesIds = parseSpeciesIds(species);

    // PERF: this walks every animal's full intake/outcome history in memory
    // (O(animals)). Acceptable at current shelter scale. Optimization candidate:
    // the completed-stay stats could restrict the fetch to animals with an
    // outcome in range, but the worklist still needs all in-care animals — so a
    // future rollup/stay table is the cleaner win than a narrower fetch here.
    const animals = await _fetchAnimalStayEvents(speciesIds);

    return {
      ...summarizeLengthOfStay(animals, range, today),
      fromLabel: range.fromLabel,
      toLabel: range.toLabel,
    };
  } catch (error) {
    console.error("Error fetching length of stay report.", error);
    throw new Error("Error fetching length of stay report.");
  }
};

export const fetchLengthOfStayReport = RequirePermission(
  AppPermissions.REPORTS_READ,
)(_fetchLengthOfStayReport);
