/**
 * Represents an action that cannot be completed because it conflicts
 * with the current state of a resource.
 * Example: Trying to approve an application for an animal that is already pending adoption.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Represents an intake or outcome day refused because it would put the
 * animal's intakes and outcomes out of order, or because it is in the future.
 * Thrown from inside the transaction that would have written the day, so the
 * write rolls back. `field` is the form field the day came from, so the
 * message can be shown under its date picker.
 */
export class TimelineOrderError extends Error {
  readonly field: "intakeDate" | "outcomeDate";

  constructor(message: string, field: "intakeDate" | "outcomeDate") {
    super(message);
    this.name = "TimelineOrderError";
    this.field = field;
  }
}

/**
 * Represents a failure to find a requested resource.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Represents an action that cannot proceed because a precondition was not met.
 * Example: Trying to finalize an adoption for an application that isn't approved.
 */
export class PreconditionFailedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PreconditionFailedError";
    }
  }

/**
 * Represents an action refused because the actor lacks the required permission.
 * 403-shaped. Thrown by `RequirePermission` and `requireFor` so a permission
 * refusal is distinguishable from a database failure — a tool can then report
 * "you're not allowed" rather than surfacing an opaque stream error.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Represents an action refused because there is no authenticated user (or the
 * authenticated user is not fully provisioned — no linked person record).
 * 401-shaped — the counterpart to `ForbiddenError`'s 403, so an error boundary
 * can eventually tell "sign in" from "you can't do this."
 */
export class UnauthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthenticatedError";
  }
}
