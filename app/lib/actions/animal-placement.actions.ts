"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { AnimalArchivedError, moveAnimal } from "../services/animal-move";
import { NotFoundError, PreconditionFailedError } from "../utils/errors";

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

  let unit: Awaited<ReturnType<typeof moveAnimal>> = null;
  try {
    unit = await prisma.$transaction((tx) =>
      moveAnimal(tx, parsedAnimalId.data, parsedUnitId, staffMemberId),
    );
  } catch (error) {
    if (error instanceof AnimalArchivedError) {
      // The board that sent this still shows the animal; refresh it so the
      // animal drops off.
      revalidatePath("/dashboard/locations");
      return { success: false, message: error.message };
    }
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
