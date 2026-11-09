import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { FieldErrors } from "@/app/lib/action-result";

/**
 * Applies server-returned field errors to a react-hook-form instance.
 *
 * Every converted form does this identically, so it lives here rather than
 * being copy-pasted into ~40 onSubmit handlers.
 *
 * The cast is unavoidable: FieldErrors is keyed by `keyof TValues` (plain
 * object keys), while setError wants `Path<TValues>` (dot-notation paths).
 * For the flat, single-level form shapes in this app the two are the same set
 * of strings. If a form ever grows nested field paths, the server would need
 * to emit dotted keys for them to resolve — worth knowing before that happens.
 */
export function applyFieldErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  fieldErrors: FieldErrors<TValues> | undefined,
): void {
  if (!fieldErrors) return;

  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (!messages || messages.length === 0) continue;
    form.setError(key as Path<TValues>, {
      type: "server",
      message: (messages as string[]).join(", "),
    });
  }
}
/**
 * Server-side field errors keyed by each issue's whole path, joined with dots
 * ("steps.2.itemId"), for a form with nested fields. `applyFieldErrors`
 * resolves those keys, so each message lands on its own field. An issue on
 * the whole form (an empty path) has no field and is left out.
 */
export function fieldErrorsByPath<TValues>(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors<TValues> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!key) continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors as FieldErrors<TValues>;
}
