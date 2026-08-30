import { cache } from "react";
import { getCachedSession } from "./session";
import { can } from "./can";
import { type AppPermission } from "./permissions";

/**
 * Checks if the current user has a specific permission.
 * This function is memoized per-request using React's `cache`.
 *
 * The role lookup itself lives in `can()` — this function is that predicate
 * plus the session read. `roles.config.ts` is the single source of truth.
 * @param requiredPermission The permission string to check for.
 * @returns A boolean indicating if the user has the permission.
 */
export const hasPermission = cache(async (requiredPermission: AppPermission) => {
  const session = await getCachedSession();
  return can(session?.user?.role, requiredPermission);
});
