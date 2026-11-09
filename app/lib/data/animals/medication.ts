// An animal's medication orders and the doses recorded against them, as its
// Medical pages show them. No auth or `next/*` imports, so database tests can
// drive it; `medication.data.ts` wraps it behind MEDICAL_READ. What an order
// expects on a day, and where it stands, is worked out by the pure
// `app/lib/utils/medication-slots.ts` from `slotOrder`.

import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import type {
  DoseSlot,
  DoseUnit,
  MedicalRoute,
  MedicationDoseResult,
  MedicationFrequency,
  MedicationOrderEventAction,
} from "@/prisma/generated/enums";
import { DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { slotOrderOf, type SlotOrder } from "@/app/lib/utils/medication-slots";

// Every read here runs one after another and selects at most one relation,
// so a transaction's client is safe too.
type Db = TransactionClient | typeof prisma;

/** A dose recorded against one of the animal's orders, live or voided. */
export interface AnimalMedicationDose {
  id: string;
  slotDate: CalendarDay;
  slot: DoseSlot | null;
  result: MedicationDoseResult;
  reportedByFoster: boolean;
  reason: string | null;
  administeredAt: Date;
  administeredById: string;
  notes: string | null;
  batchId: string | null;
  /** A voided dose counts for nothing; it is kept to show what happened. */
  voided: boolean;
  voidedAt: Date | null;
  voidedById: string | null;
  voidReason: string | null;
  createdById: string;
  createdAt: Date;
}

export interface AnimalMedicationOrderEvent {
  id: string;
  action: MedicationOrderEventAction;
  actorId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface AnimalMedicationOrder {
  id: string;
  itemId: string;
  itemName: string;
  doseAmount: number;
  doseUnit: DoseUnit;
  route: MedicalRoute;
  frequency: MedicationFrequency;
  intervalDays: number | null;
  startDate: CalendarDay;
  firstSlot: DoseSlot | null;
  endDate: CalendarDay | null;
  instructions: string | null;
  prescribedBy: string | null;
  discontinuedDate: CalendarDay | null;
  discontinueReason: string | null;
  discontinuedById: string | null;
  voidedAt: Date | null;
  voidedById: string | null;
  voidReason: string | null;
  createdById: string;
  createdAt: Date;
  /** What the slot rules read of it: which slots it expects, its state. */
  slotOrder: SlotOrder;
  /** Its audit trail, oldest first. */
  events: AnimalMedicationOrderEvent[];
  /** Its doses on the days asked for, by day and slot, voided ones too. */
  doses: AnimalMedicationDose[];
}

export interface AnimalMedications {
  /** Latest start first: the newest course leads. */
  orders: AnimalMedicationOrder[];
  /** The names behind the ids the orders, events and doses hold: the
   * people who ordered, corrected, discontinued, voided and gave, and the
   * medications the events name. */
  names: Record<string, string>;
}

const slotRank = (slot: DoseSlot | null) =>
  slot === null ? DOSE_SLOT_ORDER.length : DOSE_SLOT_ORDER.indexOf(slot);

/**
 * Every medication order of the animal, voided ones included, or those of
 * `orderIds`, with its audit trail and its doses from `fromDay` through
 * `toDay`, live and voided. A day left out leaves that end of the range
 * open: with neither, every dose.
 */
export const findAnimalMedications = async (
  db: Db,
  animalId: string,
  {
    fromDay,
    toDay,
    orderIds,
  }: { fromDay?: CalendarDay; toDay?: CalendarDay; orderIds?: readonly string[] } = {},
): Promise<AnimalMedications> => {
  const rows = await db.medicationOrder.findMany({
    where: { animalId, ...(orderIds && { id: { in: [...orderIds] } }) },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      itemId: true,
      doseAmount: true,
      doseUnit: true,
      route: true,
      frequency: true,
      intervalDays: true,
      startDate: true,
      firstSlot: true,
      endDate: true,
      instructions: true,
      prescribedBy: true,
      discontinuedDate: true,
      discontinueReason: true,
      discontinuedById: true,
      voidedAt: true,
      voidedById: true,
      voidReason: true,
      createdById: true,
      createdAt: true,
      item: { select: { name: true } },
    },
  });
  const ids = rows.map((row) => row.id);
  const events = await db.medicationOrderEvent.findMany({
    where: { orderId: { in: ids } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderId: true,
      action: true,
      actorId: true,
      before: true,
      after: true,
      createdAt: true,
    },
  });
  const doses = await db.medicationDose.findMany({
    where: {
      orderId: { in: ids },
      ...((fromDay || toDay) && { slotDate: { gte: fromDay, lte: toDay } }),
    },
    orderBy: [{ slotDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderId: true,
      slotDate: true,
      slot: true,
      result: true,
      reportedByFoster: true,
      reason: true,
      administeredAt: true,
      administeredById: true,
      notes: true,
      batchId: true,
      voidedAt: true,
      voidedById: true,
      voidReason: true,
      createdById: true,
      createdAt: true,
    },
  });

  const personIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const row of rows) {
    for (const id of [row.createdById, row.discontinuedById, row.voidedById]) {
      if (id) personIds.add(id);
    }
  }
  for (const event of events) {
    personIds.add(event.actorId);
    for (const side of [event.before, event.after]) {
      const itemId = (side as { itemId?: unknown } | null)?.itemId;
      if (typeof itemId === "string") itemIds.add(itemId);
    }
  }
  for (const dose of doses) {
    for (const id of [dose.administeredById, dose.createdById, dose.voidedById]) {
      if (id) personIds.add(id);
    }
  }
  const people = await db.person.findMany({
    where: { id: { in: [...personIds] } },
    select: { id: true, name: true },
  });
  const items = await db.medicalItem.findMany({
    where: { id: { in: [...itemIds] } },
    select: { id: true, name: true },
  });
  const names = Object.fromEntries(
    [...people, ...items].map(({ id, name }) => [id, name]),
  );

  const orders = rows.map(({ item, ...row }): AnimalMedicationOrder => ({
    ...row,
    itemName: item.name,
    startDate: calendarDay(row.startDate),
    endDate: row.endDate ? calendarDay(row.endDate) : null,
    discontinuedDate: row.discontinuedDate ? calendarDay(row.discontinuedDate) : null,
    slotOrder: slotOrderOf(row),
    events: events
      .filter((event) => event.orderId === row.id)
      .map(({ orderId: _orderId, ...event }) => event),
    doses: doses
      .filter((dose) => dose.orderId === row.id)
      .sort(
        (a, b) =>
          a.slotDate.localeCompare(b.slotDate) ||
          slotRank(a.slot) - slotRank(b.slot) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map(({ orderId: _orderId, ...dose }) => ({
        ...dose,
        slotDate: calendarDay(dose.slotDate),
        voided: dose.voidedAt !== null,
      })),
  }));

  return { orders, names };
};
