"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { Permissions } from "../auth/permissions";

// Define a Zod schema for input validation
const UpdateUserRoleSchema = z.object({
  userId: cuidSchema,
  // Ensure the role is one of the valid, non-admin enum values
  role: z.enum(Role).refine((role) => role !== Role.ADMIN, {
    error: "Assigning the Admin role is not permitted here.",
  }),
});

const _updateUserRole = async (userId: string, newRole: Role) => {
  const validation = UpdateUserRoleSchema.safeParse({ userId, role: newRole });

  if (!validation.success) {
    return {
      success: false,
      message: validation.error.issues[0]?.message || "Invalid input provided.",
    };
  }

  const { userId: validatedUserId, role: validatedRole } = validation.data;

  try {
    await prisma.user.update({
      where: {
        id: validatedUserId,
        // As a safeguard, ensure we're not updating an ADMIN role
        NOT: {
          role: Role.ADMIN,
        },
      },
      data: {
        role: validatedRole,
      },
    });

    revalidatePath("/dashboard/users");

    return {
      success: true,
      message: "User role updated successfully.",
    };
  } catch (error) {
    console.error("Failed to update user role:", error);
    return {
      success: false,
      message: "Database error: Could not update the user's role.",
    };
  }
};

export const updateUserRole = RequirePermission(Permissions.MANAGE_ROLES)(
  _updateUserRole
);
