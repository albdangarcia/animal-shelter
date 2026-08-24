import { cache } from "react";
import { getCachedSession } from "./session";
import { rolePermissions } from "./roles.config";
import { type AppPermission } from "./permissions";

/**
 * Checks if the current user has a specific permission.
 * This function is memoized per-request using React's `cache`.
 * @param requiredPermission The permission string to check for.
 * @returns A boolean indicating if the user has the permission.
 */
export const hasPermission = cache(async (requiredPermission: AppPermission) => {
  const session = await getCachedSession();
  if (!session?.user) {
    return false;
  }

  const userRole = session.user.role;
  if (!userRole) {
    return false;
  }

  // Get the list of permissions for the user's role. `role` now originates
  // from a database string column (D3) rather than an enum-typed read, so a
  // missing key would throw on `.includes` without the fallback.
  const userPermissions = rolePermissions[userRole] ?? [];

  // Check if the required permission is in the user's list
  return userPermissions.includes(requiredPermission);
});
