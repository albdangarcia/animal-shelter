// Medication doses across the shelter: the dose sheet for a day, and the
// attention queue's missed doses. No auth or `next/*` imports, so database
// tests can call them; the page's and the queue's data modules wrap them with
// their permissions. Which slots an order expects, and which have ended, is
// worked out by the pure `medication-slots.ts`; the sheet's layout by the
// pure `medication-sheet.ts`.
//
// An animal that has left care (listing status ARCHIVED) is left out of
// both, though its orders stay on its own page to be discontinued: no dose
// will be given to it here.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  AnimalListingStatus,
  MedicationFrequency,
} from "@/prisma/generated/enums";
import { DOSE_SLOT_ORDER, MISSED_DOSE_LOOKBACK_DAYS } from "@/app/lib/constants/medical";
import {
  calendarDay,
  shiftDayKey,
  type CalendarDay,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import {
  expectedSlots,
  slotEnded,
  slotOrderOf,
  type DoseSlotEnds,
  type ExpectedSlot,
} from "@/app/lib/utils/medication-slots";
import { ANIMAL_PLACE_SELECT, placeOf } from "./medical-due";
import { attentionUnitLabel, type MissedDoseRow } from "./animals/attention-queue";
import type { DoseSheetDose, DoseSheetOrder } from "./medication-sheet";

export {
  doseSheetRows,
  doseSheetSections,
  type DoseSheetDose,
  type DoseSheetGroup,
  type DoseSheetOrder,
  type DoseSheetRow,
  type DoseSheetSection,
  type DoseSheetSectionKey,
} from "./medication-sheet";

// The root client only, never a transaction's: both reads select sibling
// relations (an order's item and animal, the animal's species and unit),
// which Prisma fetches at once, and a transaction has one connection to run
// them on.
type Db = typeof prisma;

const IN_CARE = {
  listingStatus: { not: AnimalListingStatus.ARCHIVED },
} satisfies Prisma.AnimalWhereInput;

const SLOT_ORDER_SELECT = {
  frequency: true,
  intervalDays: true,
  startDate: true,
  firstSlot: true,
  endDate: true,
  discontinuedDate: true,
  voidedAt: true,
} as const satisfies Prisma.MedicationOrderSelect;

/** An order not voided that runs on `day`: started by then, not past its end
 * day, and not discontinued on or before it. */
const runsOn = (day: CalendarDay) =>
  ({
    voidedAt: null,
    startDate: { lte: day },
    OR: [{ endDate: null }, { endDate: { gte: day } }],
    AND: [{ OR: [{ discontinuedDate: null }, { discontinuedDate: { gt: day } }] }],
  }) satisfies Prisma.MedicationOrderWhereInput;

const slotRank = (slot: string | null) =>
  slot === null ? DOSE_SLOT_ORDER.length : DOSE_SLOT_ORDER.indexOf(slot as never);

/**
 * The dose sheet for `day`: every order, on animals in care, that expects a
 * slot that day or is as needed and running then, and any order that has a
 * live dose that day (one discontinued from that day keeps the doses given
 * before), each with where its animal is and the day's live doses.
 */
export const findDoseSheet = async (db: Db, day: CalendarDay): Promise<DoseSheetOrder[]> => {
  const orders = await db.medicationOrder.findMany({
    where: {
      animal: IN_CARE,
      voidedAt: null,
      OR: [runsOn(day), { doses: { some: { slotDate: day, voidedAt: null } } }],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      ...SLOT_ORDER_SELECT,
      doseAmount: true,
      doseUnit: true,
      route: true,
      instructions: true,
      item: { select: { name: true } },
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
  const doses = await db.medicationDose.findMany({
    where: { orderId: { in: orders.map((order) => order.id) }, slotDate: day, voidedAt: null },
    orderBy: [{ administeredAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderId: true,
      slot: true,
      result: true,
      reason: true,
      administeredAt: true,
      administeredById: true,
      administeredBy: { select: { name: true } },
      notes: true,
    },
  });
  const dosesByOrder = new Map<string, DoseSheetDose[]>();
  for (const { orderId, administeredBy, ...dose } of doses) {
    const list = dosesByOrder.get(orderId) ?? [];
    list.push({ ...dose, administeredByName: administeredBy.name });
    dosesByOrder.set(orderId, list);
  }

  return orders.flatMap((order): DoseSheetOrder[] => {
    const slotOrder = slotOrderOf(order);
    const orderDoses = dosesByOrder.get(order.id) ?? [];
    const slots = [
      ...new Set([
        ...expectedSlots(slotOrder, day, day).map(({ slot }) => slot),
        ...orderDoses.flatMap((dose) => (dose.slot ? [dose.slot] : [])),
      ]),
    ].sort((a, b) => slotRank(a) - slotRank(b));
    // An as-needed order the query found runs that day or has a dose on it.
    // Any other is listed only on a day it has a slot.
    if (order.frequency !== MedicationFrequency.PRN && slots.length === 0) return [];
    return [
      {
        order: {
          id: order.id,
          itemName: order.item.name,
          doseAmount: order.doseAmount,
          doseUnit: order.doseUnit,
          route: order.route,
          frequency: order.frequency,
          intervalDays: order.intervalDays,
          instructions: order.instructions,
        },
        animal: {
          id: order.animal.id,
          name: order.animal.name,
          species: order.animal.species.name,
          sex: order.animal.sex,
          primaryColor: order.animal.primaryColor.name,
          birthDate: order.animal.birthDate,
        },
        place: placeOf(order.animal),
        slots,
        doses: orderDoses,
      },
    ];
  });
};

/**
 * The slots missed on yesterday and today, per animal in care, as the
 * attention queue takes them: a slot an order expects whose window has ended
 * on the shelter's clock with no live dose. Refused and not-given doses
 * account for their slot. Older missed slots stay on the animal's own dose
 * sheet: by then they can't be given late.
 */
export const findMissedDosesForQueue = async (
  db: Db,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): Promise<MissedDoseRow[]> => {
  const from = shiftDayKey(clock.day, -MISSED_DOSE_LOOKBACK_DAYS);
  const to = clock.day;
  const orders = await db.medicationOrder.findMany({
    where: {
      animal: IN_CARE,
      voidedAt: null,
      frequency: { not: MedicationFrequency.PRN },
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
      AND: [{ OR: [{ discontinuedDate: null }, { discontinuedDate: { gt: from } }] }],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      ...SLOT_ORDER_SELECT,
      item: { select: { name: true } },
      animal: {
        select: {
          id: true,
          name: true,
          species: { select: { name: true } },
          currentUnit: { select: { name: true, location: { select: { name: true } } } },
        },
      },
    },
  });
  const doses = await db.medicationDose.findMany({
    where: {
      orderId: { in: orders.map((order) => order.id) },
      voidedAt: null,
      slotDate: { gte: from, lte: to },
    },
    select: { orderId: true, slotDate: true, slot: true },
  });
  const recorded = new Set(doses.map((dose) => `${dose.orderId}:${dose.slotDate}:${dose.slot}`));

  const byAnimal = new Map<
    string,
    { row: MissedDoseRow; medications: Set<string> }
  >();
  for (const order of orders) {
    const missed = expectedSlots(slotOrderOf(order), from, to).filter(
      (slot) =>
        slotEnded(slot, clock, ends) &&
        !recorded.has(`${order.id}:${slot.slotDate}:${slot.slot}`),
    );
    if (missed.length === 0) continue;
    let entry = byAnimal.get(order.animal.id);
    if (!entry) {
      entry = {
        row: {
          animal: {
            id: order.animal.id,
            name: order.animal.name,
            species: order.animal.species.name,
            currentUnit: attentionUnitLabel(order.animal.currentUnit),
          },
          count: 0,
          earliest: missed[0],
          medications: [],
        },
        medications: new Set(),
      };
      byAnimal.set(order.animal.id, entry);
    }
    entry.row.count += missed.length;
    if (compareSlots(missed[0], entry.row.earliest) < 0) entry.row.earliest = missed[0];
    entry.medications.add(order.item.name);
  }

  return [...byAnimal.values()]
    .map(({ row, medications }) => ({
      ...row,
      earliest: { slotDate: calendarDay(row.earliest.slotDate), slot: row.earliest.slot },
      medications: [...medications].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        compareSlots(a.earliest, b.earliest) ||
        a.animal.name.localeCompare(b.animal.name) ||
        a.animal.id.localeCompare(b.animal.id),
    );
};

const compareSlots = (a: ExpectedSlot, b: ExpectedSlot) =>
  a.slotDate.localeCompare(b.slotDate) || slotRank(a.slot) - slotRank(b.slot);
