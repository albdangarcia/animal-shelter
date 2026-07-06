// Helper function to get a random item from an array
export const getRandomItem = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// Helper function to generate random dates between 2023 and now
export function getRandomDate(yearsBack = 3): Date {
  const end = new Date();
  const start = new Date(
    end.getFullYear() - yearsBack,
    end.getMonth(),
    end.getDate(),
  );
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

// Generates a random date within the last N days from today (UTC)
export function getRandomDateWithinLastDays(
  maxDaysAgo: number,
  minDaysAgo = 1,
): Date {
  const now = new Date();
  const daysAgo =
    Math.floor(Math.random() * (maxDaysAgo - minDaysAgo + 1)) + minDaysAgo;
  const date = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
    ),
  );
  return date;
}

// Inclusive random integer in [min, max].
export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export type SeededStay = { intakeDate: Date; outcomeDate: Date | null };

// Produces `stayCount` ordered stays for one animal's lifecycle timeline.
// Every date is <= now and falls within `windowDays` of now; stays are
// strictly ordered (stay[n].intake > stay[n-1].outcome) so the sequence
// reads as a coherent, recent history. Works backwards from `now` so long
// stays still fit inside the window. Dates are produced via whole-day
// offsets, matching the calendar-day math `computeStays` (see
// stay-utils.ts) uses to measure stay length.
export function generateOrderedTimeline(opts: {
  stayCount: number;
  endsOpen: boolean;
  windowDays?: number;
  minStayDays?: number;
  maxStayDays?: number;
}): SeededStay[] {
  const {
    stayCount,
    endsOpen,
    windowDays = 90,
    minStayDays = 2,
    maxStayDays = 60,
  } = opts;

  const now = new Date();
  const windowStart = addDays(now, -windowDays);
  const stays: SeededStay[] = [];

  // `cursor` bounds how recent the next (earlier) stay's outcome may be —
  // it must fall strictly before this point so stays never overlap.
  let cursor = now;

  for (let i = stayCount - 1; i >= 0; i--) {
    const isLast = i === stayCount - 1;
    const stayLength = randomInt(minStayDays, maxStayDays);

    if (isLast && endsOpen) {
      const intakeDate = addDays(cursor, -stayLength);
      stays.unshift({ intakeDate, outcomeDate: null });
      cursor = intakeDate;
      continue;
    }

    // The outcome must fall strictly before `cursor`. Sample it directly
    // relative to `cursor` (not `now`) so the guarantee is structural: a
    // "days ago from now" proxy loses precision once `cursor` itself has
    // drifted past `windowStart` (a later stay's intake got window-clamped),
    // which previously let both ends of the gap clamp to the same instant.
    // Stay within `windowDays` of now when there's room; when the window is
    // already exhausted, ordering wins over the soft recency target.
    const rangeStart =
      cursor > windowStart ? windowStart : addDays(cursor, -(minStayDays + maxStayDays));
    const daysUntilCursor = Math.max(
      1,
      Math.round((cursor.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const outcomeDaysBeforeCursor = randomInt(1, daysUntilCursor);
    const outcomeDate = addDays(cursor, -outcomeDaysBeforeCursor);

    let intakeDate = addDays(outcomeDate, -stayLength);
    if (intakeDate < windowStart) {
      intakeDate = new Date(windowStart);
    }
    // The window clamp above can push intakeDate up to (or past) outcomeDate
    // when the outcome itself landed right at the window edge, collapsing
    // the stay to zero length. Same-instant intake/outcome events are
    // ambiguous to pair (which comes "first"?), so guarantee a strictly
    // positive stay even if it means shrinking below minStayDays.
    if (intakeDate >= outcomeDate) {
      intakeDate = addDays(outcomeDate, -1);
    }

    stays.unshift({ intakeDate, outcomeDate });
    // Leave a small buffer so the previous (earlier) stay's outcome falls
    // strictly before this stay's intake.
    cursor = addDays(intakeDate, -randomInt(1, 5));
  }

  return stays;
}
