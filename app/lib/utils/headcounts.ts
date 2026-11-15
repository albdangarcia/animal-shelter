// The dashboard's headcount cards: how full the units are, and each card's
// sub-line. Pure, so the wording and the unit arithmetic are unit-tested apart
// from the queries (app/lib/data/animals/headcounts.ts).

/** One live unit: its capacity and how many animals in care it houses. */
export type UnitOccupancy = { capacity: number; occupants: number };

export type UnitsSummary = {
  /** Live units. */
  units: number;
  /** Animals in care housed in them. */
  occupied: number;
  /** Their capacities, summed. */
  capacity: number;
  /** Units holding exactly their capacity. */
  full: number;
  /** Units holding more than their capacity. */
  over: number;
};

/**
 * Sums the units. "Full" and "over" are the shelter board's "at capacity" and
 * "over capacity" (`getCapacityState` in
 * components/dashboard/locations/shelter-board.tsx), so a unit is one or the
 * other, never both.
 */
export const summariseUnits = (rows: UnitOccupancy[]): UnitsSummary => {
  const summary: UnitsSummary = {
    units: rows.length,
    occupied: 0,
    capacity: 0,
    full: 0,
    over: 0,
  };
  for (const { capacity, occupants } of rows) {
    summary.occupied += occupants;
    summary.capacity += capacity;
    if (occupants > capacity) summary.over += 1;
    else if (occupants > 0 && occupants === capacity) summary.full += 1;
  }
  return summary;
};

/** "32 on site · 5 in foster · 2 not housed" */
export const inCareLine = (
  onSite: number,
  inFoster: number,
  notHoused: number,
): string =>
  `${onSite} on site · ${inFoster} in foster · ${notHoused} not housed`;

/** Available's sub-line: the drafts that could be published. */
export const draftsLine = (drafts: number): string => {
  if (drafts === 0) return "No drafts waiting to be published";
  return `${drafts} ${drafts === 1 ? "draft" : "drafts"} not yet published`;
};

/** Pending adoption's sub-line: how many are in a foster-to-adopt placement. */
export const fosterToAdoptLine = (fosterToAdopt: number): string => {
  if (fosterToAdopt === 0) return "None in a foster-to-adopt placement";
  return `${fosterToAdopt} in a foster-to-adopt placement`;
};

/** Space's sub-line: "3 units full · 1 over capacity". */
export const spaceLine = ({ units, full, over }: UnitsSummary): string => {
  if (units === 0) return "No units set up";
  const parts: string[] = [];
  if (full > 0) parts.push(`${full} ${full === 1 ? "unit" : "units"} full`);
  if (over > 0) parts.push(`${over} over capacity`);
  return parts.length > 0 ? parts.join(" · ") : "Every unit has space";
};
