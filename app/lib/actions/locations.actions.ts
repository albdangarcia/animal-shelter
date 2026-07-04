"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  LocationFormSchema,
  UnitFormSchema,
} from "../zod-schemas/location.schemas";

export interface LocationFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
    type?: string[];
  };
}

export interface UnitFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    name?: string[];
    capacity?: string[];
    locationId?: string[];
  };
}

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
  prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> => {
  const validatedFields = LocationFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create location.",
    };
  }

  const { name, type } = validatedFields.data;

  try {
    const existing = await findDuplicateLocation(name);
    if (existing) {
      return {
        success: false,
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
        success: false,
        message: `A location named "${name}" already exists — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error creating location:", error);
    return {
      success: false,
      message: "Database Error: Failed to create location.",
    };
  }

  revalidatePath("/dashboard/settings/locations");
  return { success: true, message: "Location created successfully." };
};

const _updateLocation = async (
  locationId: string,
  prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> => {
  const parsedId = cuidSchema.safeParse(locationId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid location ID format." };
  }

  const validatedFields = LocationFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update location.",
    };
  }

  const { name, type } = validatedFields.data;

  try {
    const existing = await findDuplicateLocation(name, parsedId.data);
    if (existing) {
      return {
        success: false,
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
        success: false,
        message: `A location named "${name}" already exists — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error updating location:", error);
    return {
      success: false,
      message: "Database Error: Failed to update location.",
    };
  }

  revalidatePath("/dashboard/settings/locations");
  return { success: true, message: "Location updated successfully." };
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
    // occupied). The admin must delete or move its units first.
    const unitCount = await prisma.unit.count({
      where: { locationId: parsedId.data, deletedAt: null },
    });
    if (unitCount > 0) {
      return {
        success: false,
        message:
          "Can't delete this location while it still has units. Delete or move its units first.",
      };
    }

    await prisma.location.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
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
const findDuplicateUnit = async (
  name: string,
  locationId: string,
  excludeId?: string,
) => {
  return prisma.unit.findFirst({
    where: {
      locationId,
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
};

const _createUnit = async (
  prevState: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> => {
  const validatedFields = UnitFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create unit.",
    };
  }

  const { name, capacity, locationId } = validatedFields.data;

  try {
    const existing = await findDuplicateUnit(name, locationId);
    if (existing) {
      return {
        success: false,
        message: `A unit named "${name}" already exists in this location.`,
      };
    }

    await prisma.unit.create({ data: { name, capacity, locationId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        message: `A unit named "${name}" already exists in this location — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error creating unit:", error);
    return {
      success: false,
      message: "Database Error: Failed to create unit.",
    };
  }

  revalidatePath("/dashboard/settings/locations");
  return { success: true, message: "Unit created successfully." };
};

const _updateUnit = async (
  unitId: string,
  prevState: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> => {
  const parsedId = cuidSchema.safeParse(unitId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid unit ID format." };
  }

  const validatedFields = UnitFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update unit.",
    };
  }

  const { name, capacity, locationId } = validatedFields.data;

  try {
    const existing = await findDuplicateUnit(name, locationId, parsedId.data);
    if (existing) {
      return {
        success: false,
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
        success: false,
        message: `A unit named "${name}" already exists in this location — it may be deleted; check the list to restore it.`,
      };
    }
    console.error("Database Error updating unit:", error);
    return {
      success: false,
      message: "Database Error: Failed to update unit.",
    };
  }

  revalidatePath("/dashboard/settings/locations");
  return { success: true, message: "Unit updated successfully." };
};

const _deleteUnit = async (
  unitId: string,
): Promise<{ success: boolean; message: string }> => {
  const parsedId = cuidSchema.safeParse(unitId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid unit ID format." };
  }

  try {
    // Block deleting a unit that still has an animal housed in it.
    const animalCount = await prisma.animal.count({
      where: { currentUnitId: parsedId.data },
    });
    if (animalCount > 0) {
      return {
        success: false,
        message:
          "Can't delete this unit while animals are housed in it. Move the animals out first.",
      };
    }

    await prisma.unit.update({
      where: { id: parsedId.data },
      data: { deletedAt: new Date() },
    });
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
    await prisma.unit.update({
      where: { id: parsedId.data },
      data: { deletedAt: null },
    });
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
