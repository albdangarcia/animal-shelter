import { cache } from "react";
import { auth } from "@/auth";
import { rolePermissions } from "./roles.config";
import { type Permission } from "./permissions";

/**
 * Checks if the current user has a specific permission.
 * This function is memoized per-request using React's `cache`.
 * @param requiredPermission The permission string to check for.
 * @returns A boolean indicating if the user has the permission.
 */
export const hasPermission = cache(async (requiredPermission: Permission) => {
  const session = await auth();
  if (!session?.user) {
    return false;
  }

  const userRole = session.user.role;
  if (!userRole) {
    return false;
  }

  // Get the list of permissions for the user's role
  const userPermissions = rolePermissions[userRole];

  // Check if the required permission is in the user's list
  return userPermissions.includes(requiredPermission);
});