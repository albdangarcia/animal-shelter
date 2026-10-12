// The shelter-wide due list: scheduled care across every animal in care. The
// reads have no auth or `next/*` imports, so database tests can call them;
// `medical-due.data.ts` wraps them behind MEDICAL_READ. Grouping and bucketing
// are in `medical-due-groups.ts`, pure functions of the rows and the shelter's
// today.
//
// An animal that has left care (listing status ARCHIVED) is left out, though
// its scheduled entries stay open on its own page: nothing will be given to
// it here, and if it comes back its care shows as overdue again, which is
// true.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalListingStatus,
  MedicalEntryStatus,
  type MedicalEntryKind,
} from "@/prisma/generated/enums";
import {
  calendarDay,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";
import {
  UPCOMING_DAYS,
  type MedicalDueListRow,
  type MedicalDuePlace,
} from "./medical-due-groups";
import {
  attentionUnitLabel,
  type MedicalDueRow,
} from "./animals/attention-queue";

export {
  UPCOMING_DAYS,
  dueBucket,
  groupMedicalDue,
  type MedicalDueBucket,
  type MedicalDueGroup,
  type MedicalDueListRow,
  type MedicalDuePlace,
} from "./medical-due-groups";

type Db = TransactionClient | typeof prisma;

/** Where an animal is, as `placeOf` reads it. */
export const ANIMAL_PLACE_SELECT = {
  currentUnit: {
    select: {
      id: true,
      name: true,
      location: { select: { id: true, name: true } },
    },
  },
  // An open placement is one with no end day. One per animal is a rule of
  // the placement actions, not of the database, so the latest one is taken.
  fosterPlacements: {
    where: { endDate: null },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      fosterProfile: {
        select: { person: { select: { id: true, name: true } } },
      },
    },
  },
} as const satisfies Prisma.AnimalSelect;

const DUE_ENTRY_SELECT = {
  id: true,
  kind: true,
  status: true,
  dueDate: true,
  completedDate: true,
  itemId: true,
  procedure: true,
  notes: true,
  item: { select: { name: true } },
} as const satisfies Prisma.MedicalEntrySelect;

/** The entry as a due row shows it, and as its Record, Reschedule and
 * Decline buttons need it. */
export type MedicalDueEntry = Prisma.MedicalEntryGetPayload<{
  select: typeof DUE_ENTRY_SELECT;
}> & { dueDate: CalendarDay };

/**
 * Scheduled care that isn't voided, due on or before today plus
 * `upcomingDays`, for animals in care. Overdue care has no lower bound: it
 * stays on the list until someone records, reschedules, declines or voids it.
 * `kinds` empty means every kind.
 */
export const findMedicalDue = async (
  db: Db,
  today: CalendarDay,
  options: { upcomingDays?: number; kinds?: MedicalEntryKind[] } = {},
): Promise<MedicalDueListRow[]> => {
  const { upcomingDays = UPCOMING_DAYS, kinds = [] } = options;
  const rows = await db.medicalEntry.findMany({
    where: {
      status: MedicalEntryStatus.SCHEDULED,
      voidedAt: null,
      // Days are `yyyy-MM-dd` strings, so they compare as days.
      dueDate: { lte: shiftDayKey(today, upcomingDays) },
      ...(kinds.length > 0 && { kind: { in: kinds } }),
      animal: { listingStatus: { not: AnimalListingStatus.ARCHIVED } },
    },
    orderBy: [
      { dueDate: "asc" },
      { animal: { name: "asc" } },
      { item: { name: "asc" } },
      { id: "asc" },
    ],
    select: {
      ...DUE_ENTRY_SELECT,
      animal: {
        select: {
          id: true,
          name: true,
          species: { select: { name: true } },
          sex: true,
          primaryColor: { select: { name: true } },
          birthDate: true,
          ...ANIMAL_PLACE_SELECT,
        },
      },
    },
  });

  return rows.map(({ animal, ...entry }) => ({
    // `lte` matched, so the due day is there.
    entry: { ...entry, dueDate: calendarDay(entry.dueDate!) },
    animal: {
      id: animal.id,
      name: animal.name,
      species: animal.species.name,
      sex: animal.sex,
      primaryColor: animal.primaryColor.name,
      birthDate: animal.birthDate,
    },
    place: placeOf(animal),
  }));
};

/**
 * Scheduled care due today or overdue, for animals in care, as the attention
 * queue takes it: what needs doing today. Care coming up later isn't on it
 * yet.
 */
export const findMedicalDueForQueue = async (
  db: Db,
  today: CalendarDay,
): Promise<MedicalDueRow[]> => {
  const rows = await db.medicalEntry.findMany({
    where: {
      status: MedicalEntryStatus.SCHEDULED,
      voidedAt: null,
      dueDate: { lte: today },
      animal: { listingStatus: { not: AnimalListingStatus.ARCHIVED } },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      dueDate: true,
      procedure: true,
      item: { select: { name: true } },
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
    entryId: row.id,
    itemName: medicalEntryName(row),
    kind: row.kind,
    // `lte` matched, so the due day is there.
    dueDate: calendarDay(row.dueDate!),
  }));
};

/**
 * A unit first, as the housing board has it: an animal in a unit is there,
 * whatever else it has open. Then an open foster placement. Then neither.
 */
export const placeOf = (animal: {
  currentUnit: {
    id: string;
    name: string;
    location: { id: string; name: string };
  } | null;
  fosterPlacements: { fosterProfile: { person: { id: string; name: string } } }[];
}): MedicalDuePlace => {
  if (animal.currentUnit) {
    return {
      type: "UNIT",
      locationId: animal.currentUnit.location.id,
      locationName: animal.currentUnit.location.name,
      unitId: animal.currentUnit.id,
      unitName: animal.currentUnit.name,
    };
  }
  const foster = animal.fosterPlacements[0]?.fosterProfile.person;
  if (foster) {
    return { type: "FOSTER", fosterPersonId: foster.id, fosterName: foster.name };
  }
  return { type: "NOT_HOUSED" };
};
