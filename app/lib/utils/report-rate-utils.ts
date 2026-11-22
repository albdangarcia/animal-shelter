/**
 * Live release rate as a 0..1 ratio, or `null` when there are no outcomes: a
 * rate over nothing is undefined, not 0%. The overview card and the outcomes
 * report both use this, so they show the same thing for an empty period.
 */
export function liveReleaseRate(liveCount: number, total: number): number | null {
  return total === 0 ? null : liveCount / total;
}

/** Formats a 0..1 ratio as a 1-decimal percent, or "—" when null. */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
