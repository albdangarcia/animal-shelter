// A link to a report surface that keeps the period and species the viewer
// picked. Every link between the reports (a card, the breadcrumb, the CSV
// download) goes through here, so none of them can drop a filter the others
// keep.

export type ReportLinkParams = {
  from?: string;
  to?: string;
  species?: string;
  /** `yyyy-MM`: the Shelter Animals Count report's one filter. */
  month?: string;
};

/** `base` with the `from`, `to`, `species` and `month` params that are set. */
export function reportHref(
  base: string,
  { from, to, species, month }: ReportLinkParams,
): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (species) params.set("species", species);
  if (month) params.set("month", month);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * The names of the species picked in a `species` param, in the list's order.
 * Only ids in `all` count, so a mangled id drops out as it does from the
 * counts. Empty means every species.
 */
export function pickedSpeciesNames(
  all: readonly { id: string; name: string }[],
  species: string | undefined,
): string[] {
  const ids = new Set((species ?? "").split(",").map((id) => id.trim()));
  return all.filter((s) => ids.has(s.id)).map((s) => s.name);
}

/** "Cat, Dog", or "All species" when none is picked. */
export function speciesLabel(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "All species";
}

/** The reports that can be downloaded, as named in the download's URL. */
export const REPORT_EXPORTS = [
  "overview",
  "outcomes",
  "intakes",
  "length-of-stay",
  // Shelter Animals Count: one month, not a period and species.
  "sac",
] as const;

export type ReportExport = (typeof REPORT_EXPORTS)[number];

/** Where a report's CSV is downloaded, for the same period and species. */
export function reportCsvHref(
  report: ReportExport,
  params: ReportLinkParams,
): string {
  return reportHref(`/api/reports/${report}`, params);
}
