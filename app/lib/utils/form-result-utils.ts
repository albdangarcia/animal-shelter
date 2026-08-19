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