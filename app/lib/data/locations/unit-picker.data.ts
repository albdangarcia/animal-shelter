import prisma from "@/app/lib/prisma";
import type { LocationType } from "@/prisma/generated/enums";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

// A unit offered by the placement picker, with its live occupancy for the hint.
export interface UnitPickerUnit {
  id: string;
  name: string;
  capacity: number;
  occupancy: number; // non-archived animals currently in this unit
}

export interface UnitPickerLocation {
  id: string;
  name: string;
  type: LocationType;
  units: UnitPickerUnit[];
}

const _fetchUnitPickerOptions = async (): Promise<UnitPickerLocation[]> => {
  try {
    // Placement picker: exclude soft-deleted locations/units — you can't place
    // an animal in a deleted unit. Occupancy is derived from currentUnitId
    // (non-archived animals); there is no stored occupancy field.
    const locations = await prisma.location.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        units: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            capacity: true,
            _count: {
              select: {
                animals: {
                  where: { listingStatus: { not: "ARCHIVED" } },
                },
              },
            },
          },
        },
      },
    });

    return locations.map((location) => ({
      id: location.id,
      name: location.name,
      type: location.type,
      units: location.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        capacity: unit.capacity,
        occupancy: unit._count.animals,
      })),
    }));
  } catch (error) {
    console.error("Failed to fetch unit picker options:", error);
    throw new Error("Could not fetch unit picker options.");
  }
};

export const fetchUnitPickerOptions = RequirePermission(
  AppPermissions.ANIMAL_INFO_MANAGE,
)(_fetchUnitPickerOptions);
