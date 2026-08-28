import {
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

/**
 * AI tools return structured results, never throw. A thrown error inside
 * `execute` surfaces as a stream error and gives the model nothing to say; a
 * `{ ok: false, reason }` lets it explain the problem to the user.
 *
 * `FormResult` is not reused — its `fieldErrors` are keyed to form input names.
 */
export type ToolFailure = { ok: false; reason: string };
export type ToolSuccess<T> = { ok: true } & T;
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export function toolFailure(reason: string): ToolFailure {
  return { ok: false, reason };
}

/**
 * Maps a caught error to a safe `reason` string. Never leaks raw database
 * error text to the model. `requireFor` throws `ForbiddenError`, the
 * data layer throws `NotFoundError` / `PreconditionFailedError`; anything else
 * is logged here and reported generically.
 */
export function describeToolError(error: unknown): string {
  if (error instanceof ForbiddenError) {
    return "You do not have permission to use this tool.";
  }
  if (error instanceof NotFoundError) {
    return "The requested record could not be found.";
  }
  if (error instanceof PreconditionFailedError) {
    return error.message;
  }
  console.error("Unexpected error inside an AI tool.", error);
  return "Something went wrong while running this tool. Try again or rephrase the request.";
}
