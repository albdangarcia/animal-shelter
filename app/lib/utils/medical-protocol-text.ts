// How medical protocols read in words. Pure, so the unit tests can pin it.

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/** A species named in the plural, in lower case: "Dog" reads "dogs". */
export const speciesPlural = (name: string): string => {
  const lower = name.trim().toLowerCase();
  return lower.endsWith("s") ? lower : `${lower}s`;
};

/**
 * The ages a protocol covers, as whole days on the intake day: "from birth to
 * 139 days", "from 140 days", "from 56 to 139 days", "at every age". The
 * range includes `minAgeDays` and stops short of `maxAgeDays`, so the last
 * age read is the day before it.
 */
export const coveredAgesText = (
  minAgeDays: number | null,
  maxAgeDays: number | null,
): string => {
  const from = minAgeDays ?? 0;
  if (maxAgeDays === null) {
    return from === 0 ? "at every age" : `from ${days(from)}`;
  }
  const to = maxAgeDays - 1;
  if (to === from) return `aged ${days(from)}`;
  return from === 0 ? `from birth to ${days(to)}` : `from ${from} to ${days(to)}`;
};
