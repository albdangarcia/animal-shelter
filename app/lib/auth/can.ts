import { Role } from "@/prisma/generated/enums";
import { rolePermissions } from "./roles.config";
import { type AppPermission } from "./permissions";

/**
 * The pure permission predicate: does this role carry this permission?
 *
 * Synchronous and side-effect free — no session read, no `cache()`, no I/O.
 * `hasPermission` is this function plus a session read; the AI tool layer calls
 * it (via `requireFor`) with an actor resolved once and passed explicitly,
 * because tool `execute` runs mid-stream where request context is not reliably
 * available. `roles.config.ts` stays the single source
 * of truth — this is the only lookup.
 *
 * Accepts `string | null | undefined` rather than `Role`: role originates from a
 * database string column, not an enum-typed read, so widening the parameter
 * preserves `hasPermission`'s existing behavior and avoids casts at call sites.
 */
export function can(
  role: string | null | undefined,
  permission: AppPermission,
): boolean {
  // The `?? []` fallback is load-bearing: a role value with no entry in
  // `rolePermissions` (unknown string, null, undefined) must return `false`,
  // not throw on `.includes`.
  return (rolePermissions[role as Role] ?? []).includes(permission);
}
