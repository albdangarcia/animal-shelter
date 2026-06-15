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