/**
 * Which locations the Settings → Locations status filter shows, from its
 * `status` search param ("active", "deleted", or both, comma-separated).
 * Nothing selected, or "active" alone, shows the live ones; "deleted" alone
 * shows the deleted ones; both show all.
 */
export type LocationStatusView = "active" | "deleted" | "all";

export const parseLocationStatus = (
  statusInput?: string,
): LocationStatusView => {
  const selected = statusInput ? statusInput.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");
  if (wantsDeleted && !wantsActive) return "deleted";
  if (wantsDeleted && wantsActive) return "all";
  return "active";
};

/**
 * What the Locations card says when the filter shows no location, and
 * whether it offers Add Location. An empty Deleted view only means nothing
 * is deleted: it neither says no location exists nor offers to add one.
 */
export const emptyLocationsState = (
  view: LocationStatusView,
): { message: string; offerAdd: boolean } =>
  view === "deleted"
    ? { message: "There are no deleted locations.", offerAdd: false }
    : { message: "No locations have been created yet.", offerAdd: true };
