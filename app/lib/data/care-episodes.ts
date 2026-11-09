// Care episodes across the shelter: the attention queue's "under care with
// nothing planned" signal, and the dashboard's list of animals under care.
// No auth or `next/*` imports, so database tests can call them; the queue's
// and the dashboard's data modules wrap them with their permissions.
//
// An animal that has left care (listing status ARCHIVED) is left out of
// both, though an episode left open on it stays on its own page to close:
// nothing will be done for it here.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalListingStatus,
  CareEpisodeType,
  MedicalEntryStatus,
  TaskStatus,
} from "@/prisma/generated/enums";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { ANIMAL_PLACE_SELECT, placeOf } from "./medical-due";
import {
  attentionUnitLabel,
  type CareUnplannedRow,
} from "./animals/attention-queue";

// The root client only, never a transaction's: both reads select sibling
// relations (the animal and its clinic, the animal's species and unit),
// which Prisma fetches at once, and a transaction has one connection to
// run them on.
type Db = typeof prisma;

const OPEN_EPISODE_IN_CARE = {
  endDate: null,
  voidedAt: null,
  animal: { listingStatus: { not: AnimalListingStatus.ARCHIVED } },
} satisfies Prisma.CareEpisodeWhereInput;

/**
 * Open episodes on animals in care that have nothing planned: no open task,
 * no scheduled care that isn't voided, and no medication order running or
 * still to start on `today` (not voided, not discontinued, its end day not
 * before today). Such an animal needs care and nobody has planned any;
 * creating a task, scheduling care or ordering a medication clears it.
 */
export const findUnplannedCareForQueue = async (
  db: Db,
  today: CalendarDay,
): Promise<CareUnplannedRow[]> => {
  const rows = await db.careEpisode.findMany({
    where: {
      ...OPEN_EPISODE_IN_CARE,
      animal: {
        ...OPEN_EPISODE_IN_CARE.animal,
        tasks: {
          none: { status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
        },
        medicalEntries: {
          none: { status: MedicalEntryStatus.SCHEDULED, voidedAt: null },
        },
        // An order is discontinued from a day no later than today, so any
        // discontinued order has stopped.
        medicationOrders: {
          none: {
            voidedAt: null,
            discontinuedDate: null,
            OR: [{ endDate: null }, { endDate: { gte: today } }],
          },
        },
      },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      startDate: true,
      animal: {
        select: {
          id: true,
          name: true,
          species: { select: { name: true } },
          currentUnit: {
            select: { name: true, location: { select: { name: true } } },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    animal: {
      id: row.animal.id,
      name: row.animal.name,
      species: row.animal.species.name,
      currentUnit: attentionUnitLabel(row.animal.currentUnit),
    },
    episodeId: row.id,
    episodeType: row.type,
    startDate: calendarDay(row.startDate),
  }));
};

/** An animal under care, as the dashboard lists it. */
export interface UnderCareRow {
  /** The episode's id. */
  id: string;
  type: CareEpisodeType;
  startDate: CalendarDay;
  animal: { id: string; name: string };
  /** "Medical wing · MED-1", "In foster", the clinic for a stay off site,
   *  or "Not housed". */
  where: string;
}

/**
 * Open episodes on animals in care, the latest start first, at most `take`.
 */
export const findOpenCareEpisodes = async (
  db: Db,
  { take }: { take: number },
): Promise<UnderCareRow[]> => {
  const rows = await db.careEpisode.findMany({
    where: OPEN_EPISODE_IN_CARE,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      type: true,
      startDate: true,
      partner: { select: { name: true } },
      animal: { select: { id: true, name: true, ...ANIMAL_PLACE_SELECT } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    startDate: calendarDay(row.startDate),
    animal: { id: row.animal.id, name: row.animal.name },
    where: whereUnderCare(row.type, row.partner?.name ?? null, row.animal),
  }));
};

const whereUnderCare = (
  type: CareEpisodeType,
  clinicName: string | null,
  animal: Parameters<typeof placeOf>[0],
): string => {
  // A stay off site is at the clinic, whatever unit the animal left behind.
  if (type === CareEpisodeType.HOSPITALISED_OFF_SITE && clinicName) {
    return clinicName;
  }
  const place = placeOf(animal);
  switch (place.type) {
    case "UNIT":
      return `${place.locationName} · ${place.unitName}`;
    case "FOSTER":
      return "In foster";
    case "NOT_HOUSED":
      return "Not housed";
  }
};
