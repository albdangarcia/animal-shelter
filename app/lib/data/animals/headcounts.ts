// The dashboard's headcount cards: where the animals in care are now, how
// many are available or pending adoption, and how full the units are.
// No auth or `next/*` imports, so database tests can call it; the dashboard's
// data module (`fetchHeadcounts` in analytics.data.ts) wraps it with its
// permission.
//
// The buckets are the shelter board's own filters (shelter-board.ts), so the
// dashboard and /dashboard/locations never disagree. An animal hospitalised
// off site keeps its unit (a care episode doesn't move it), so, as on the
// board, it counts on site and in that unit's capacity: the unit is held for
// its return.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalListingStatus,
  FosterPlacementType,
} from "@/prisma/generated/enums";
import {
  IN_FOSTER,
  IN_CARE,
  LIVE_LOCATION,
  LIVE_UNIT,
  NOT_HOUSED,
  ON_SITE,
} from "../locations/shelter-board";
import { summariseUnits, type UnitsSummary } from "@/app/lib/utils/headcounts";

// The root client: the reads run at once, which a transaction's single
// connection can't do.
type Db = typeof prisma;

export type Headcounts = {
  onSite: number;
  inFoster: number;
  notHoused: number;
  /** On site + in foster + not housed: every animal in care, once. */
  inCare: number;
  published: number;
  drafts: number;
  pendingAdoption: number;
  /** Of the pending adoptions, those in an open foster-to-adopt placement. */
  fosterToAdopt: number;
  /** Live units in live locations, and the animals in care they house. */
  units: UnitsSummary;
};

/**
 * Counts every animal in care by the board's buckets and listing status, and
 * sums the live units. `animal` narrows every animal counted and `unit` the
 * units summed, each ANDed so it can't loosen a filter (as
 * `countOpenCareEpisodesByType` takes `animal`): the database tests share one
 * database, and narrow to their own animals and locations.
 */
export const countHeadcounts = async (
  db: Db,
  {
    animal,
    unit,
  }: { animal?: Prisma.AnimalWhereInput; unit?: Prisma.UnitWhereInput } = {},
): Promise<Headcounts> => {
  const animalsWhere = (
    filter: Prisma.AnimalWhereInput,
  ): Prisma.AnimalWhereInput => ({
    AND: [filter, ...(animal ? [animal] : [])],
  });

  const [
    onSite,
    inFoster,
    notHoused,
    published,
    drafts,
    pendingAdoption,
    fosterToAdopt,
    unitRows,
  ] = await Promise.all([
    db.animal.count({ where: animalsWhere(ON_SITE) }),
    db.animal.count({ where: animalsWhere(IN_FOSTER) }),
    db.animal.count({ where: animalsWhere(NOT_HOUSED) }),
    db.animal.count({
      where: animalsWhere({ listingStatus: AnimalListingStatus.PUBLISHED }),
    }),
    db.animal.count({
      where: animalsWhere({ listingStatus: AnimalListingStatus.DRAFT }),
    }),
    db.animal.count({
      where: animalsWhere({
        listingStatus: AnimalListingStatus.PENDING_ADOPTION,
      }),
    }),
    db.animal.count({
      where: animalsWhere({
        listingStatus: AnimalListingStatus.PENDING_ADOPTION,
        fosterPlacements: {
          some: { endDate: null, type: FosterPlacementType.FOSTER_TO_ADOPT },
        },
      }),
    }),
    // As the board reads a unit: live, in a live location, counting the
    // animals in care it houses.
    db.unit.findMany({
      where: {
        AND: [LIVE_UNIT, { location: LIVE_LOCATION }, ...(unit ? [unit] : [])],
      },
      select: {
        capacity: true,
        _count: { select: { animals: { where: animalsWhere(IN_CARE) } } },
      },
    }),
  ]);

  return {
    onSite,
    inFoster,
    notHoused,
    inCare: onSite + inFoster + notHoused,
    published,
    drafts,
    pendingAdoption,
    fosterToAdopt,
    units: summariseUnits(
      unitRows.map((row) => ({
        capacity: row.capacity,
        occupants: row._count.animals,
      })),
    ),
  };
};
