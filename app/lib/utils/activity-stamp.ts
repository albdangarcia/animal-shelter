/**
 * When to stamp an activity row the feed must show after another: now, or a
 * millisecond after `after` when now isn't later. The feed orders by time
 * alone, and rows written back to back can share a millisecond. Undefined
 * when there is nothing to follow, so the database's default stamp applies.
 */
export const stampedAfter = (after: Date | null | undefined): Date | undefined =>
  after ? new Date(Math.max(Date.now(), after.getTime() + 1)) : undefined;
