/**
 * The shelter-wide readiness board: every animal's blockers regrouped by
 * kind, so each group is one kind of work and one team's list. Pure — the
 * data layer computes each animal's blockers, this filters, groups and
 * orders them.
 *
 * Within a group the animal blocked longest comes first. How long is read
 * off each blocker's `since`, in whole days on the shelter's calendar, so
 * every viewer sees the same count whatever their own timezone.
 */

import type { AnimalListingStatus } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "../utils/enum-formatter";
import {
  formatShelterDay,
  shelterDayKey,
  shelterDaysBetween,
} from "../utils/shelter-day";
import type { ReadinessBlocker } from "./compute-readiness";

/** Where an animal is right now. Fostered and unplaced animals have no unit. */
export type ReadinessPlacement =
  | { kind: "UNIT"; locationId: string; locationName: string; unitName: string }
  | { kind: "FOSTER" }
  | { kind: "UNPLACED" };

export interface ReadinessAnimal {
  id: string;
  name: string;
  species: string;
  listingStatus: AnimalListingStatus;
  placement: ReadinessPlacement;
}

export interface AnimalReadiness {
  animal: ReadinessAnimal;
  blockers: ReadinessBlocker[];
}

export type ReadinessBlockerKind = ReadinessBlocker["kind"];

/**
 * Board order: what could hurt an animal or mislead an adopter first, then
 * the checks that stand between an animal and its listing, then routine
 * paperwork.
 */
export const BLOCKER_KIND_ORDER: readonly ReadinessBlockerKind[] = [
  "ESCALATED_FINDING",
  "ACUTE_HEALTH",
  "UNSUPPORTED_CHARACTERISTIC",
  "MISSING_ASSESSMENT",
  "NOT_SPAYED_NEUTERED",
  "NO_PHOTO",
];

/** Location filter values that aren't a location id. */
export const FOSTER_LOCATION = "foster";
export const UNPLACED_LOCATION = "unplaced";

/** Preview rows shown per group on the overview, longest-blocked first. */
export const READINESS_PREVIEW_LIMIT = 5;
/** Rows per page once a group is opened full-screen via `?kind=`. */
export const READINESS_KIND_PAGE_SIZE = 10;

/** One animal's blockers in board order, flattened into one list — a single
 *  animal has too few blockers to need the board's per-kind sections. */
export const orderBlockers = (
  blockers: readonly ReadinessBlocker[],
): ReadinessBlocker[] =>
  BLOCKER_KIND_ORDER.flatMap((kind) => blockers.filter((b) => b.kind === kind));

const isBlockerKind = (value: string): value is ReadinessBlockerKind =>
  (BLOCKER_KIND_ORDER as readonly string[]).includes(value);

/** Empty means "any" for each filter; `kind` narrows the board to one
 *  group's full, paginated row list instead of every group's preview. */
export interface ReadinessBoardFilters {
  species: string[];
  /** Location ids, `FOSTER_LOCATION` or `UNPLACED_LOCATION`. */
  locations: string[];
  stages: string[];
  kind: ReadinessBlockerKind | null;
}

const splitParam = (value: string | undefined): string[] =>
  value ? value.split(",").filter(Boolean) : [];

/** Reads the board's filters from its comma-separated URL params. An
 *  unrecognized `kind` (a stale link, a hand-edited URL) is read as none
 *  rather than thrown on — it just lands back on the overview. */
export function parseReadinessBoardFilters(params: {
  species?: string;
  location?: string;
  stage?: string;
  kind?: string;
}): ReadinessBoardFilters {
  return {
    species: splitParam(params.species),
    locations: splitParam(params.location),
    stages: splitParam(params.stage),
    kind: params.kind && isBlockerKind(params.kind) ? params.kind : null,
  };
}

const placementKey = (placement: ReadinessPlacement): string => {
  switch (placement.kind) {
    case "UNIT":
      return placement.locationId;
    case "FOSTER":
      return FOSTER_LOCATION;
    case "UNPLACED":
      return UNPLACED_LOCATION;
  }
};

const matchesFilters = (
  animal: ReadinessAnimal,
  filters: ReadinessBoardFilters,
): boolean =>
  (filters.species.length === 0 || filters.species.includes(animal.species)) &&
  (filters.locations.length === 0 ||
    filters.locations.includes(placementKey(animal.placement))) &&
  (filters.stages.length === 0 || filters.stages.includes(animal.listingStatus));

export interface FilterOption {
  value: string;
  label: string;
}

export interface ReadinessBoardFilterOptions {
  species: FilterOption[];
  locations: FilterOption[];
  stages: FilterOption[];
}

// Lifecycle order rather than alphabetical: a draft comes before a listing.
const STAGE_ORDER: readonly AnimalListingStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "PENDING_ADOPTION",
];

const STAGE_LABELS: Record<AnimalListingStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  PENDING_ADOPTION: "Pending adoption",
  ARCHIVED: "Archived",
};

export const stageLabel = (stage: AnimalListingStatus): string =>
  STAGE_LABELS[stage];

/**
 * The values each filter can take, drawn from the animals on the board so a
 * choice never names a location or species with nobody in it. Built from
 * every animal, blocked or not, so the choices don't shift as filters narrow.
 */
export function readinessBoardFilterOptions(
  animals: readonly ReadinessAnimal[],
): ReadinessBoardFilterOptions {
  const species = [...new Set(animals.map((a) => a.species))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  const locationNames = new Map<string, string>();
  let fostered = false;
  let unplaced = false;
  for (const { placement } of animals) {
    if (placement.kind === "UNIT") {
      locationNames.set(placement.locationId, placement.locationName);
    } else if (placement.kind === "FOSTER") {
      fostered = true;
    } else {
      unplaced = true;
    }
  }
  const locations: FilterOption[] = [...locationNames]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label }));
  if (fostered) locations.push({ value: FOSTER_LOCATION, label: "In foster" });
  if (unplaced) locations.push({ value: UNPLACED_LOCATION, label: "Unplaced" });

  const present = new Set(animals.map((a) => a.listingStatus));
  const stages = STAGE_ORDER.filter((s) => present.has(s)).map((value) => ({
    value,
    label: STAGE_LABELS[value],
  }));

  return { species, locations, stages };
}

export interface ReadinessBoardRow {
  animal: ReadinessAnimal;
  /** This animal's blockers of the group's kind — at least one. */
  blockers: ReadinessBlocker[];
  /** The earliest `since` among them; null when none of them is dated. */
  since: Date | null;
  /** Whole shelter-calendar days from `since` to now; null when undated. */
  blockedDays: number | null;
}

export interface ReadinessBoardOverviewGroup {
  kind: ReadinessBlockerKind;
  /** Up to `READINESS_PREVIEW_LIMIT` rows, longest-blocked first. */
  rows: ReadinessBoardRow[];
  /** Every row of this kind, not just the preview — how "Show all N" gets its N. */
  totalCount: number;
}

export interface ReadinessBoardOverview {
  view: "overview";
  /** One per kind, in `BLOCKER_KIND_ORDER`, including empty ones. */
  groups: ReadinessBoardOverviewGroup[];
  /** Animals matching the filters, blocked or not. */
  animalCount: number;
  /** Of those, how many have at least one blocker. */
  blockedCount: number;
}

export interface ReadinessBoardDetail {
  view: "detail";
  kind: ReadinessBlockerKind;
  /** This page's rows only. */
  rows: ReadinessBoardRow[];
  page: number;
  pageSize: number;
  /** Every row of this kind, across all pages. */
  totalRows: number;
  totalPages: number;
  /** Animals matching the filters, blocked or not. */
  animalCount: number;
  /** Of those, how many have at least one blocker. */
  blockedCount: number;
}

export type ReadinessBoard = ReadinessBoardOverview | ReadinessBoardDetail;

/** When the oldest of these blockers began; null when none of them is dated. */
export const earliestSince = (
  blockers: readonly ReadinessBlocker[],
): Date | null =>
  blockers.reduce<Date | null>(
    (earliest, { since }) =>
      since && (!earliest || since < earliest) ? since : earliest,
    null,
  );

// Longest blocked first; undated rows after every dated one; then by name,
// then id, so two animals with one name still land in a fixed order.
const compareRows = (a: ReadinessBoardRow, b: ReadinessBoardRow): number => {
  if (a.since && b.since) {
    const bySince = a.since.getTime() - b.since.getTime();
    if (bySince !== 0) return bySince;
  } else if (a.since || b.since) {
    return a.since ? -1 : 1;
  }
  return (
    a.animal.name.localeCompare(b.animal.name) ||
    a.animal.id.localeCompare(b.animal.id)
  );
};

/** Every row of one kind, longest-blocked first — the full list a group's
 *  preview is truncated from, and a detail page paginates over. */
function rowsForKind(
  matching: readonly AnimalReadiness[],
  kind: ReadinessBlockerKind,
  now: Date,
  timezone: string,
): ReadinessBoardRow[] {
  const rows: ReadinessBoardRow[] = [];
  for (const { animal, blockers } of matching) {
    const ofKind = blockers.filter((b) => b.kind === kind);
    if (ofKind.length === 0) continue;
    const since = earliestSince(ofKind);
    rows.push({
      animal,
      blockers: ofKind,
      since,
      blockedDays: since ? shelterDaysBetween(since, now, timezone) : null,
    });
  }
  return rows.sort(compareRows);
}

/**
 * `filters.kind` set narrows the board to that one kind's full row list,
 * paginated by `page` (1-indexed, `READINESS_KIND_PAGE_SIZE` per page) —
 * the "Show all N" drill-down. Otherwise every kind gets a preview of its
 * `READINESS_PREVIEW_LIMIT` longest-blocked rows. `animalCount` and
 * `blockedCount` always reflect every filtered animal, not just the one
 * kind being viewed, so the summary line stays meaningful while drilled in.
 */
export function buildReadinessBoard(
  readiness: readonly AnimalReadiness[],
  filters: ReadinessBoardFilters,
  now: Date,
  page = 1,
  timezone: string,
): ReadinessBoard {
  const matching = readiness.filter((r) => matchesFilters(r.animal, filters));
  const animalCount = matching.length;
  const blockedCount = matching.filter((r) => r.blockers.length > 0).length;

  if (filters.kind) {
    const rows = rowsForKind(matching, filters.kind, now, timezone);
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / READINESS_KIND_PAGE_SIZE);
    const start = (page - 1) * READINESS_KIND_PAGE_SIZE;
    return {
      view: "detail",
      kind: filters.kind,
      rows: rows.slice(start, start + READINESS_KIND_PAGE_SIZE),
      page,
      pageSize: READINESS_KIND_PAGE_SIZE,
      totalRows,
      totalPages,
      animalCount,
      blockedCount,
    };
  }

  const groups = BLOCKER_KIND_ORDER.map((kind) => {
    const rows = rowsForKind(matching, kind, now, timezone);
    return {
      kind,
      rows: rows.slice(0, READINESS_PREVIEW_LIMIT),
      totalCount: rows.length,
    };
  });

  return { view: "overview", groups, animalCount, blockedCount };
}

const CLAIM_ISSUE_TEXT = {
  CONTRADICTED: "contradicted by a live finding",
  SOURCE_DELETED: "cites a deleted assessment",
  NO_LONGER_SUPPORTED: "its assessment no longer supports it",
} as const;

/** What a blocker is, in the words the board and the panel show it in. */
export const describeBlocker = (blocker: ReadinessBlocker, timezone: string): string => {
  switch (blocker.kind) {
    case "MISSING_ASSESSMENT":
      return blocker.templateName;
    case "ESCALATED_FINDING":
      return `${blocker.templateName} of ${formatShelterDay(shelterDayKey(blocker.observedAt, timezone))}`;
    case "UNSUPPORTED_CHARACTERISTIC":
      return `${blocker.characteristicName} — ${CLAIM_ISSUE_TEXT[blocker.issue]}`;
    case "NOT_SPAYED_NEUTERED":
      return "Not spayed or neutered";
    case "NO_PHOTO":
      return "No photo on the profile";
    case "ACUTE_HEALTH":
      return formatSingleEnumOption(blocker.healthStatus);
  }
};

export interface BlockerAction {
  label: string;
  href: string;
}

/** What the viewer may change, which decides whether a row offers the fix
 *  itself or only the page where it is made. */
export interface ReadinessViewerCan {
  manageAssessments: boolean;
  manageAnimalInfo: boolean;
  managePhotos: boolean;
}

/**
 * Where each blocker is cleared. A viewer who can make the change is sent to
 * the form that makes it; one who can't is sent to the page that shows it,
 * worded as a look rather than a promise.
 */
export function blockerAction(
  blocker: ReadinessBlocker,
  animalId: string,
  can: ReadinessViewerCan,
): BlockerAction {
  const animal = `/dashboard/animals/${animalId}`;
  switch (blocker.kind) {
    case "MISSING_ASSESSMENT":
      return can.manageAssessments
        ? {
            label: `Record ${blocker.templateName}`,
            href: `${animal}/assessments/create?template=${encodeURIComponent(blocker.templateKey)}`,
          }
        : { label: "View assessments", href: `${animal}/assessments` };
    case "ESCALATED_FINDING":
      return {
        label: `Review the ${blocker.templateName}`,
        href: `${animal}/assessments/${blocker.assessmentId}`,
      };
    case "UNSUPPORTED_CHARACTERISTIC":
      return { label: "Review characteristics", href: `${animal}/characteristics` };
    case "NOT_SPAYED_NEUTERED":
      return can.manageAnimalInfo
        ? { label: "Update spay/neuter status", href: `${animal}/edit` }
        : { label: "View profile", href: animal };
    case "ACUTE_HEALTH":
      return can.manageAnimalInfo
        ? { label: "Update health status", href: `${animal}/edit` }
        : { label: "View profile", href: animal };
    case "NO_PHOTO":
      return {
        label: can.managePhotos ? "Add a photo" : "View photos",
        href: `${animal}/photos`,
      };
  }
}
