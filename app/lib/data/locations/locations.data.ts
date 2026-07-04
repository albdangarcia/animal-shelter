import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

export type LocationWithUnits = Prisma.LocationGetPayload<{
  include: { units: true };
}>;

const _fetchLocationsWithUnits = async (): Promise<LocationWithUnits[]> => {
  try {
    // Management view: include soft-deleted locations AND units so admins can
    // see and restore deleted rows.
    return await prisma.location.findMany({
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
