import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { parseLocationStatus } from "./location-status";

export type LocationWithUnits = Prisma.LocationGetPayload<{
  include: { units: true };
}>;

const _fetchLocationsWithUnits = async (
  statusInput?: string,
): Promise<LocationWithUnits[]> => {
  // Status filter: deleted locations show only when "deleted" is selected.
  const view = parseLocationStatus(statusInput);
  const deletedFilter: Prisma.LocationWhereInput =
    view === "deleted"
      ? { deletedAt: { not: null } }
      : view === "all"
        ? {}
        : { deletedAt: null };

  try {
    // Management view: units are always included (even soft-deleted ones) so
    // admins can see and restore deleted rows within a still-visible location.
    return await prisma.location.findMany({
      where: deletedFilter,
      include: {
        units: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Failed to fetch locations:", error);
    throw new Error("Could not fetch locations.");
  }
};

export const fetchLocationsWithUnits = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_fetchLocationsWithUnits);
