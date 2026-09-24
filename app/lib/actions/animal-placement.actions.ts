"use server";

import { revalidatePath } from "next/cache";
import { AnimalActivityType } from "@/prisma/generated/enums";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { buildLocationChangeSummary } from "../utils/location-activity";
import { findLiveUnitForPlacement } from "../services/unit-housing";
import { NotFoundError, PreconditionFailedError } from "../utils/errors";
import { lockAnimal } from "../data/application-status.data";

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

  let parsedUnitId: string | null = null;
  if (targetUnitId !== null) {
    const parsed = cuidSchema.safeParse(targetUnitId);
    if (!parsed.success) {
      return { success: false, message: "Invalid unit ID format." };
    }
    parsedUnitId = parsed.data;
  }

  let unit: Awaited<ReturnType<typeof findLiveUnitForPlacement>> = null;
  try {
    unit = await prisma.$transaction(async (tx) => {
      // Capture the animal's current placement before the move so the log can
      // read "from X to Y" rather than just "to Y". Read behind the animal's
      // lock: two moves of one animal at once would otherwise both read the
      // same starting unit, and the second would log a move from a unit the
      // animal had already left.
      await lockAnimal(tx, parsedAnimalId.data);
      const currentAnimal = await tx.animal.findUnique({
        where: { id: parsedAnimalId.data },
        select: {
          currentUnitId: true,
          currentUnit: {
            select: { name: true, location: { select: { name: true } } },
          },
        },
      });
      if (!currentAnimal) {
        throw new NotFoundError("That animal no longer exists.");
      }
      const previousUnitId = currentAnimal.currentUnitId;
      const previousUnit = currentAnimal.currentUnit;

      // Guard against a stale board: the unit may have been soft-deleted
      // since the board was rendered, or be being deleted now. Read behind the
      // unit's lock, in the transaction that writes, so a delete either waits
      // for this move and sees the animal, or is seen by it.
      const target =
        parsedUnitId === null
          ? null
          : await findLiveUnitForPlacement(tx, parsedUnitId);
      if (parsedUnitId !== null && !target) {
        throw new PreconditionFailedError("That unit is no longer available.");
      }
      const targetUnitIdResolved = target?.id ?? null;

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
              target ? { name: target.name, location: target.location } : null,
            ),
          },
        });
      }

      return target;
    });
  } catch (error) {
    if (
      error instanceof PreconditionFailedError ||
      error instanceof NotFoundError
    ) {
      return { success: false, message: error.message };
    }
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
