// Shared phrasing for LOCATION_CHANGE activity-log summaries so the two genuine
// relocation points (the animal edit action and the board move action) read
// identically. Labels use "Location · Unit" formatting (location name, middle
// dot, unit name) so units are unambiguous across locations.

interface UnitLabel {
  name: string;
  location: { name: string };
}

const formatUnitLabel = (unit: UnitLabel): string =>
  `${unit.location.name} · ${unit.name}`;

/**
 * Builds the `changeSummary` for a LOCATION_CHANGE log from the previous and
 * next unit labels. Pass `null` for a side that is unplaced.
 */
export const buildLocationChangeSummary = (
  previousUnit: UnitLabel | null,
  nextUnit: UnitLabel | null
): string => {
  if (!previousUnit && nextUnit) {
    // Placed from unplaced.
    return `Moved to ${formatUnitLabel(nextUnit)}.`;
  }
  if (previousUnit && !nextUnit) {
    // Removed to unplaced.
    return `Removed from ${formatUnitLabel(previousUnit)} (now unplaced).`;
  }
  if (previousUnit && nextUnit) {
    // Moved between units.
    return `Moved from ${formatUnitLabel(previousUnit)} to ${formatUnitLabel(
      nextUnit
    )}.`;
  }
  // Both null — no relocation. Callers guard against this, but keep it safe.
  return "Location updated.";
};
