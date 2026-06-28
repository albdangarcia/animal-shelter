/** For required Yes/No fields (no "unspecified" option). */
export const toYesNo = (value: boolean | null | undefined): "true" | "false" =>
  value ? "true" : "false";

/** For optional Yes/No/Unspecified select fields. */
export const boolToSelectValue = (
  value: boolean | null | undefined
): "true" | "false" | undefined => {
  if (value === true) return "true";
  if (value === false) return "false";
  return undefined;
};

/**
 * Add this to: app/lib/utils/form-utils.ts
 * (alongside the existing toYesNo helper — same file)
 *
 * Builds a FormData object from a flat record of string form values, skipping
 * null/undefined entries. Used by the staff adoption application forms whose
 * fields are all flat strings.
 *
 * NOTE: This is intentionally only for flat-string forms. It is NOT suitable for
 * the intake form, which needs special handling (array fields appended per-element,
 * Date values serialized via toISOString). Those forms keep their bespoke onSubmit.
 */
export function buildApplicationFormData(
  data: Record<string, string | undefined | null>,
): FormData {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });
  return formData;
}