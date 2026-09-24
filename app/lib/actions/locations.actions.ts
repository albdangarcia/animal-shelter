"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/prisma/generated/client";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  LocationFormSchema,
  UnitFormSchema,
} from "../zod-schemas/location.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  deleteLocationIfEmpty,
  deleteUnitIfEmpty,
  lockLiveLocation,
  restoreUnitIfLocationLive,
} from "@/app/lib/services/unit-housing";

type LocationFormInput = z.input<typeof LocationFormSchema>;
type LocationResult = FormResult<LocationFormInput>;

type UnitFormInput = z.input<typeof UnitFormSchema>;
type UnitResult = FormResult<UnitFormInput>;

// case-insensitive, global, ignores the row being
// edited (so renaming a location to itself doesn't collide). Among non-deleted
// rows only.
const findDuplicateLocation = async (name: string, excludeId?: string) => {
  return prisma.location.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createLocation = async (
  values: LocationFormInput,
): Promise<LocationResult> => {
  const validatedFields = LocationFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create location.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<LocationFormInput>,
    };
  }

  const { name, type } = validatedFields.data;

  try {
    const existing = await findDuplicateLocation(name);
    if (existing) {
      return {
        ok: false,
        message: `A location named "${name}" already exists.`,
      };
    }

    await prisma.location.create({ data: { name, type } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: `A location named "${name}" already exists — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error creating location:", error);
    return { ok: false, message: "Database Error: Failed to create location." };
  }

  revalidatePath("/dashboard/settings/locations");
  return { ok: true, message: "Location created successfully." };
};

const _updateLocation = async (
  locationId: string,
  values: LocationFormInput,
): Promise<LocationResult> => {
  const parsedId = cuidSchema.safeParse(locationId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid location ID format." };
  }

  const validatedFields = LocationFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update location.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<LocationFormInput>,
    };
  }

  const { name, type } = validatedFields.data;

  try {
    const existing = await findDuplicateLocation(name, parsedId.data);
    if (existing) {
      return {
        ok: false,
        message: `A location named "${name}" already exists.`,
      };
    }

    await prisma.location.update({
      where: { id: parsedId.data },
      data: { name, type },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: `A location named "${name}" already exists — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error updating location:", error);
    return { ok: false, message: "Database Error: Failed to update location." };
  }

  revalidatePath("/dashboard/settings/locations");
  return { ok: true, message: "Location updated successfully." };
};

const _deleteLocation = async (
  locationId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(locationId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid location ID format." };
  }

  try {
    // Block deleting a location that still has any non-deleted unit (empty or
    // occupied). The admin must delete or move its units first. Checked and
    // written behind the location's lock, so a unit added or restored at the
    // same moment is either counted or refused.
    const deleted = await prisma.$transaction((tx) =>
      deleteLocationIfEmpty(tx, parsedId.data),
    );
    if (!deleted) {
      return {
        success: false,
        message:
          "Can't delete this location while it still has units. Delete or move its units first.",
      };
    }

    revalidatePath("/dashboard/settings/locations");
    return { success: true, message: "Location deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting location:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete location.",
    };
  }
};

const _restoreLocation = async (
  locationId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(locationId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid location ID format." };
  }

  try {
    await prisma.location.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
    revalidatePath("/dashboard/settings/locations");
    return { success: true, message: "Location restored successfully." };
  } catch (error) {
    console.error("Database Error restoring location:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore location.",
    };
  }
};

// ═══════════════════════════════════════════════════
// UNITS
// ═══════════════════════════════════════════════════

// Duplicate check scoped per location (matches @@unique([name, locationId])).
// Inside a transaction, pass its client: the global one would wait for a
// second connection while the transaction holds the first.
const findDuplicateUnit = async (
  name: string,
  locationId: string,
  excludeId?: string,
  db: Pick<TransactionClient, "unit"> = prisma,
) => {
  return db.unit.findFirst({
    where: {
      locationId,
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createUnit = async (values: UnitFormInput): Promise<UnitResult> => {
  const validatedFields = UnitFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create unit.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<UnitFormInput>,
    };
  }

  const { name, capacity, locationId } = validatedFields.data;

  try {
    // The location is checked behind its lock, so one deleted at the same
    // moment either sees this unit or refuses it.
    const refusal = await prisma.$transaction(async (tx) => {
      if (!(await lockLiveLocation(tx, locationId))) {
        return "Can't add a unit to a deleted location. Restore the location first.";
      }

      const existing = await findDuplicateUnit(
        name,
        locationId,
        undefined,
        tx,
      );
      if (existing) {
        return `A unit named "${name}" already exists in this location.`;
      }

      await tx.unit.create({ data: { name, capacity, locationId } });
      return null;
    });
    if (refusal) {
      return { ok: false, message: refusal };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: `A unit named "${name}" already exists in this location — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error creating unit:", error);
    return { ok: false, message: "Database Error: Failed to create unit." };
  }

  revalidatePath("/dashboard/settings/locations");
  return { ok: true, message: "Unit created successfully." };
};

const _updateUnit = async (
  unitId: string,
  values: UnitFormInput,
): Promise<UnitResult> => {
  const parsedId = cuidSchema.safeParse(unitId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid unit ID format." };
  }

  const validatedFields = UnitFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update unit.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<UnitFormInput>,
    };
  }

  const { name, capacity, locationId } = validatedFields.data;

  try {
    const existing = await findDuplicateUnit(name, locationId, parsedId.data);
    if (existing) {
      return {
        ok: false,
        message: `A unit named "${name}" already exists in this location.`,
      };
    }

    // A unit doesn't move between locations via this form. Only name and
    // capacity are editable.
    await prisma.unit.update({
      where: { id: parsedId.data },
      data: { name, capacity },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: `A unit named "${name}" already exists in this location — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error updating unit:", error);
    return { ok: false, message: "Database Error: Failed to update unit." };
  }

  revalidatePath("/dashboard/settings/locations");
  return { ok: true, message: "Unit updated successfully." };
};

const _deleteUnit = async (
  unitId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(unitId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid unit ID format." };
  }

  try {
    // Block deleting a unit that still has an animal housed in it. Checked and
    // written behind the unit's lock, so an animal placed at the same moment
    // is either counted or refused the unit.
    const deleted = await prisma.$transaction((tx) =>
      deleteUnitIfEmpty(tx, parsedId.data),
    );
    if (!deleted) {
      return {
        success: false,
        message:
          "Can't delete this unit while animals are housed in it. Move the animals out first.",
      };
    }

    revalidatePath("/dashboard/settings/locations");
    return { success: true, message: "Unit deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting unit:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete unit.",
    };
  }
};

const _restoreUnit = async (
  unitId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(unitId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid unit ID format." };
  }

  try {
    // A unit comes back only into a live location: a location is deleted only
    // once it has no live unit, and the pickers hide a deleted one's units.
    // Checked behind the location's lock, like adding a unit.
    const restored = await prisma.$transaction((tx) =>
      restoreUnitIfLocationLive(tx, parsedId.data),
    );
    if (!restored) {
      return {
        success: false,
        message:
          "Can't restore a unit in a deleted location. Restore the location first.",
      };
    }
    revalidatePath("/dashboard/settings/locations");
    return { success: true, message: "Unit restored successfully." };
  } catch (error) {
    console.error("Database Error restoring unit:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore unit.",
    };
  }
};

export const createLocation = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_createLocation);

export const updateLocation = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_updateLocation);

export const deleteLocation = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_deleteLocation);

export const restoreLocation = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_restoreLocation);

export const createUnit = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_createUnit);

export const updateUnit = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_updateUnit);

export const deleteUnit = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_deleteUnit);

export const restoreUnit = RequirePermission(
  AppPermissions.MANAGE_LOCATIONS,
)(_restoreUnit);
