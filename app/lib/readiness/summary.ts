/**
 * The dashboard's "Readiness" card: the readiness board summed up in a few
 * lines, each linking into the board. Pure, and every count is read off
 * `buildReadinessBoard` itself (with the same filters the card's links put in
 * the board's URL), so the card and the board can never disagree.
 */

import {
  BLOCKER_KIND_TITLES,
  URGENT_BLOCKER_KINDS,
  buildReadinessBoard,
  isBlocked,
  type AnimalReadiness,
  type ReadinessBlockerKind,
  type ReadinessBoardFilters,
  type ReadinessBoardOverview,
} from "./board";

/** How many ready drafts the card names before "and N more". */
export const READY_DRAFTS_NAMED = 5;
/** How many blocker groups the card lists at most. */
export const READINESS_CARD_GROUP_LIMIT = 3;
/** Kinds the card never lists: the dashboard's own "Under care" card, just
 *  above, already covers every animal under an open care episode. */
const KINDS_LEFT_OUT: readonly ReadinessBlockerKind[] = ["UNDER_CARE"];

export interface ReadinessSummaryGroup {
  kind: ReadinessBlockerKind;
  title: string;
  /** The group's `totalCount` on the board's overview. */
  count: number;
}

export interface ReadinessSummary {
  /** Every animal on the board (non-archived), blocked or not. */
  animalCount: number;
  /** Of those, how many have no blockers. */
  readyCount: number;
  /** Drafts with no blockers: listings waiting only to be published. */
  readyDrafts: {
    count: number;
    /** The first `READY_DRAFTS_NAMED` by name. */
    named: { id: string; name: string }[];
  };
  /** Published animals with at least one blocker, as the board counts them
   *  under `?stage=PUBLISHED`. */
  publishedBlockedCount: number;
  /** Urgent groups first whenever non-zero, then the largest of the rest
   *  (ties in board order); `READINESS_CARD_GROUP_LIMIT` at most. */
  groups: ReadinessSummaryGroup[];
}

const NO_FILTERS: ReadinessBoardFilters = {
  species: [],
  locations: [],
  stages: [],
  kind: null,
};

/** The board's overview for these stages, as `/dashboard/readiness?stage=`
 *  builds it. */
const overview = (
  readiness: readonly AnimalReadiness[],
  stages: string[],
  now: Date,
  timezone: string,
): ReadinessBoardOverview => {
  const board = buildReadinessBoard(
    readiness,
    { ...NO_FILTERS, stages },
    now,
    1,
    timezone,
  );
  if (board.view !== "overview") {
    throw new Error("The readiness board without a kind is an overview.");
  }
  return board;
};

export function summariseReadiness(
  readiness: readonly AnimalReadiness[],
  now: Date,
  timezone: string,
): ReadinessSummary {
  const all = overview(readiness, [], now, timezone);
  const drafts = overview(readiness, ["DRAFT"], now, timezone);
  const published = overview(readiness, ["PUBLISHED"], now, timezone);

  // The board's own rule for "blocked", so the names are always the animals
  // its count counts.
  const named = readiness
    .filter((r) => r.animal.listingStatus === "DRAFT" && !isBlocked(r))
    .map(({ animal }) => ({ id: animal.id, name: animal.name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, READY_DRAFTS_NAMED);

  const shown = all.groups.filter(
    (group) => group.totalCount > 0 && !KINDS_LEFT_OUT.includes(group.kind),
  );
  const isUrgent = (kind: ReadinessBlockerKind) =>
    URGENT_BLOCKER_KINDS.includes(kind);
  // `all.groups` is in board order and `sort` is stable, so equal counts
  // keep it.
  const groups = [
    ...shown.filter((group) => isUrgent(group.kind)),
    ...shown
      .filter((group) => !isUrgent(group.kind))
      .sort((a, b) => b.totalCount - a.totalCount),
  ]
    .slice(0, READINESS_CARD_GROUP_LIMIT)
    .map(({ kind, totalCount }) => ({
      kind,
      title: BLOCKER_KIND_TITLES[kind],
      count: totalCount,
    }));

  return {
    animalCount: all.animalCount,
    readyCount: all.animalCount - all.blockedCount,
    readyDrafts: {
      count: drafts.animalCount - drafts.blockedCount,
      named,
    },
    publishedBlockedCount: published.blockedCount,
    groups,
  };
}

/** The card's description: "4 of 12 animals ready", "Every animal is ready",
 *  or "No animals in care". */
export const readinessHeadline = ({
  animalCount,
  readyCount,
}: Pick<ReadinessSummary, "animalCount" | "readyCount">): string => {
  if (animalCount === 0) return "No animals in care";
  if (readyCount === animalCount) return "Every animal is ready";
  return `${readyCount} of ${animalCount} ${animalCount === 1 ? "animal" : "animals"} ready`;
};

/** "3 ready but not published", or "None ready but not published". */
export const readyDraftsLine = (count: number): string =>
  `${count === 0 ? "None" : count} ready but not published`;

/** "2 published with something outstanding", or "None published with
 *  something outstanding". */
export const publishedBlockedLine = (count: number): string =>
  `${count === 0 ? "None" : count} published with something outstanding`;

/** "and 4 more", after the named ready drafts. */
export const moreLine = (count: number): string => `and ${count} more`;

/** A group's line: "No photo · 7". */
export const groupLine = ({ title, count }: ReadinessSummaryGroup): string =>
  `${title} · ${count}`;

/** What a group's count counts, for screen readers only: the visible line
 *  leaves it out to stay short, so the link is read "No photo · 7 animals". */
export const groupCountNoun = ({ count }: ReadinessSummaryGroup): string =>
  count === 1 ? "animal" : "animals";
