import { can } from "./can";
import { type AppPermission } from "./permissions";
import { ForbiddenError, PreconditionFailedError } from "../utils/errors";
import type { SessionUser } from "./session.types";

/**
 * A deliberately narrow identity — only the fields an actor-attributed write or
 * an audit-log row needs. Smaller than `SessionUser` (better-auth's inferred
 * type, which also carries `email`, `image`, `emailVerified`, and whatever lands
 * in `additionalFields` later) so a future field addition can't silently widen
 * what flows into AI runtime context or a model provider.
 */
export type Actor = {
  userId: string;
  personId: string;
  role: string;
};

/**
 * Narrows a `SessionUser` to an `Actor`.
 *
 * `personId` is required — `AnimalActivityLog.changedById` and every
 * actor-attributed write need it. A user with no linked person record is
 * authenticated but unusable here: the broken thing is the `User → Person`
 * link, a precondition failure — not "you're not signed in". Rejected with the
 * same message the form actions use (see `_createAnimal`).
 */
export function toActor(user: SessionUser): Actor {
  if (!user.personId) {
    throw new PreconditionFailedError(
      "Authentication Error: Your user account is not associated with a person record.",
    );
  }

  return {
    userId: user.id,
    personId: user.personId,
    role: user.role ?? "",
  };
}

/**
 * The actor-based permission guard. A plain guard, not a HOF: the wrapper shape
 * of `RequirePermission` exists because server actions are bare exported
 * functions with no natural place for a check. AI tools call `requireFor` on
 * their first line, which keeps the tool's own signature honest.
 *
 * Throws `ForbiddenError` — same message as `RequirePermission` — so a refusal
 * is distinguishable from a database failure.
 *
 */
export function requireFor(actor: Actor, permission: AppPermission): void {
  if (!can(actor.role, permission)) {
    throw new ForbiddenError(
      "Access Denied. You do not have permission to perform this action.",
    );
  }
}
