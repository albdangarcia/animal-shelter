"use server";

import { revalidatePath } from "next/cache";
import { AnimalActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { buildLocationChangeSummary } from "../utils/location-activity";

export interface MoveAnimalResult {
  success: boolean;
  message?: string;
  // Advisory capacity info, set when the move landed the destination unit
  // over its capacity. The move itself still succeeded.
  overCapacity?: boolean;
  unitLabel?: string;
  newCount?: number;
  capacity?: number;
}

// Moves an animal to a unit (or to Unplaced when targetUnitId is null) by
// writing Animal.currentUnitId — the single source of truth for occupancy.
// Capacity is never enforced: over-capacity is reported back so the client
// can warn, but the write always goes through. Last-write-wins.
const _moveAnimalToUnit = async (
  user: SessionUser,
  animalId: string,
  targetUnitId: string | null,
): Promise<MoveAnimalResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { success: false, message: "Invalid animal ID format." };
  }
  const staffMemberId = user.personId;

  let unit: {
    id: string;
    name: string;
    capacity: number;
    location: { name: string };
  } | null = null;
  
  if (targetUnitId !== null) {
    const parsedUnitId = cuidSchema.safeParse(targetUnitId);
    if (!parsedUnitId.success) {
      return { success: false, message: "Invalid unit ID format." };
    }

    try {
      // Guard against a stale board: the unit may have been soft-deleted
      // since the board was rendered.
      unit = await prisma.unit.findFirst({
        where: { id: parsedUnitId.data, deletedAt: null },
        select: {
          id: true,
          name: true,
          capacity: true,
          location: { select: { name: true } },
        },
      });
    } catch (error) {
      console.error("Database Error looking up unit:", error);
      return { success: false, message: "Database Error: Failed to move animal." };
    }

    if (!unit) {
      return { success: false, message: "That unit is no longer available." };
    }
  }

  // Capture the animal's current placement BEFORE the move so the log can read
  // "from X to Y" rather than just "to Y".
  let previousUnit: { name: string; location: { name: string } } | null = null;
  let previousUnitId: string | null = null;
  try {
    const currentAnimal = await prisma.animal.findUnique({
      where: { id: parsedAnimalId.data },
      select: {
        currentUnitId: true,
        currentUnit: {
          select: { name: true, location: { select: { name: true } } },
        },
      },
    });
    if (!currentAnimal) {
      return { success: false, message: "That animal no longer exists." };
    }
    previousUnitId = currentAnimal.currentUnitId;
    previousUnit = currentAnimal.currentUnit;
  } catch (error) {
    console.error("Database Error looking up animal:", error);
    return { success: false, message: "Database Error: Failed to move animal." };
  }

  const targetUnitIdResolved = unit?.id ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.animal.update({
        where: { id: parsedAnimalId.data },
        data: { currentUnitId: targetUnitIdResolved },
      });

      // Only log when the unit actually changed (e.g. skip a drop back onto
      // the same unit).
      if (previousUnitId !== targetUnitIdResolved && staffMemberId) {
        await tx.animalActivityLog.create({
          data: {
            animalId: parsedAnimalId.data,
            activityType: AnimalActivityType.LOCATION_CHANGE,
            changedById: staffMemberId,
            changeSummary: buildLocationChangeSummary(
              previousUnit,
              unit ? { name: unit.name, location: unit.location } : null,
            ),
          },
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { success: false, message: "That animal no longer exists." };
    }
    console.error("Database Error moving animal:", error);
    return { success: false, message: "Database Error: Failed to move animal." };
  }

  let result: MoveAnimalResult = { success: true };
  if (unit) {
    try {
      const newCount = await prisma.animal.count({
        where: { currentUnitId: unit.id, listingStatus: { not: "ARCHIVED" } },
      });
      if (newCount > unit.capacity) {
        result = {
          success: true,
          overCapacity: true,
          unitLabel: unit.name,
          newCount,
          capacity: unit.capacity,
        };
      }
    } catch (error) {
      // The move already succeeded; the warning is advisory, so don't fail.
      console.error("Database Error counting unit occupancy:", error);
    }
  }

  revalidatePath("/dashboard/locations");
  return result;
};

export const moveAnimalToUnit = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_INFO_MANAGE)(_moveAnimalToUnit),
);
