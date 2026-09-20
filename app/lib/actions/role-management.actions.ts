"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Role } from "@/prisma/generated/enums";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { authIdSchema } from "../zod-schemas/common.schemas";
import {
  DeactivateUserSchema,
  ReactivateUserSchema,
} from "../zod-schemas/role-management.schemas";
import {
  RequirePermission,
  withAuthenticatedUser,
  type SessionUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { ConflictError, NotFoundError } from "../utils/errors";
import {
  deactivateAccount,
  reactivateAccount,
} from "../services/user-deactivation";

const ROLE_MANAGEMENT_PATH = "/dashboard/settings/role-management";

// Define a Zod schema for input validation
const UpdateUserRoleSchema = z.object({
  userId: authIdSchema,
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

    revalidatePath(ROLE_MANAGEMENT_PATH);

    return {
      success: true,
      message: "User role updated successfully.",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // The where clause matched no row: either the user doesn't exist,
      // or they're an admin and the NOT guard blocked the update.
      return {
        success: false,
        message:
          "User not found, or this user is an admin and cannot be modified here.",
      };
    }

    console.error("Failed to update user role:", error);
    return {
      success: false,
      message: "Database error: Could not update the user's role.",
    };
  }
};

export const updateUserRole = RequirePermission(AppPermissions.MANAGE_ROLES)(
  _updateUserRole
);

/**
 * Bar an account from the app, or lift the bar. The work is in
 * `user-deactivation`; these are the authorization, the transaction and the
 * cache invalidation around it.
 *
 * An admin action performed *on* an account, exactly like the role change
 * above and held by the same permission: `MANAGE_ROLES` answers "what may this
 * account do", and whether it may sign in at all is squarely that. There is
 * deliberately no self-service version. With no self-serve sign-up and no
 * password reset, a user who deactivated their own account would be locked out
 * of their own adoption applications with no way to ask for help except
 * phoning the shelter.
 *
 * This bars an account, not a human: someone deactivated can sign up again
 * under a different provider account and get a fresh record, and nothing here
 * connects the two. That is a feature with its own design, not a gap to patch
 * in this action.
 */
const _setAccountDeactivated = async (
  actor: SessionUser,
  userId: string,
  reason: string,
  deactivate: boolean,
) => {
  const validation = (
    deactivate ? DeactivateUserSchema : ReactivateUserSchema
  ).safeParse({ userId, reason });
  if (!validation.success) {
    return {
      success: false,
      message: validation.error.issues[0]?.message || "Invalid input provided.",
    };
  }
  const input = validation.data;
  const acting = { userId: actor.id, personId: actor.personId };

  let personId: string;
  try {
    ({ personId } = await prisma.$transaction((tx) =>
      deactivate
        ? deactivateAccount(tx, input.userId, acting, { reason: input.reason })
        : reactivateAccount(tx, input.userId, acting, { reason: input.reason || null }),
    ));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return { success: false, message: error.message };
    }
    console.error("Failed to change account state:", error);
    return {
      success: false,
      message: "Database error: Could not update the account.",
    };
  }

  revalidatePath(ROLE_MANAGEMENT_PATH);
  // The note this wrote lands on that person's record.
  revalidatePath(`/dashboard/people-directory/${personId}`, "layout");

  return {
    success: true,
    message: deactivate
      ? "Account deactivated. It can no longer sign in."
      : "Account reactivated. It can sign in again.",
  };
};

const _deactivateUser = (actor: SessionUser, userId: string, reason: string) =>
  _setAccountDeactivated(actor, userId, reason, true);

const _reactivateUser = (actor: SessionUser, userId: string, reason: string) =>
  _setAccountDeactivated(actor, userId, reason, false);

export const deactivateUser = withAuthenticatedUser(
  RequirePermission(AppPermissions.MANAGE_ROLES)(_deactivateUser),
);

export const reactivateUser = withAuthenticatedUser(
  RequirePermission(AppPermissions.MANAGE_ROLES)(_reactivateUser),
);
