// Whether a reader may see a nav entry. No auth and no next/* imports: the
// caller says how to check a permission (`getFilteredLinks.ts` passes the
// request's session), so this stays unit-testable.
import { type AppPermission } from "./auth/permissions";

export interface NavItemGate {
  permission?: AppPermission;
  anyPermissions?: readonly AppPermission[];
  allPermissions?: readonly AppPermission[];
}

/**
 * `anyPermissions` (hold ANY of the listed) wins, then `allPermissions` (hold
 * EVERY one listed), then the single `permission`. An entry with none is
 * ungated. Checks stop at the first permission that settles the answer.
 */
export async function navItemAllowed(
  item: NavItemGate,
  check: (permission: AppPermission) => boolean | Promise<boolean>,
): Promise<boolean> {
  if (item.anyPermissions && item.anyPermissions.length > 0) {
    for (const permission of item.anyPermissions) {
      if (await check(permission)) return true;
    }
    return false;
  }
  if (item.allPermissions && item.allPermissions.length > 0) {
    for (const permission of item.allPermissions) {
      if (!(await check(permission))) return false;
    }
    return true;
  }
  if (item.permission) {
    return check(item.permission);
  }
  return true;
}
