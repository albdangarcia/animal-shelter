// Which dose slots a medication order expects, and what each slot's state is.
//
// An order expects a dose in each of its frequency's named slots on each day
// it runs: once a day the AM slot; twice a day AM and PM; three times a day
// AM, Midday and PM; every few days the AM slot on the start day and every
// `intervalDays` after it; as needed, no slot at all. It runs from its start
// day (from `firstSlot` on, that day) through its end day, inclusive, or
// until the day before it was discontinued; a voided order expects nothing.
//
// A slot has ended by the wall clock: when the shelter's day is after the
// slot's, or is the slot's day and the clock reads at or past the slot's end
// time. Days are `yyyy-MM-dd` and times `"HH:mm"`, so both compare as strings,
// and no instant is built from a slot, so a skipped or repeated hour can't
// misplace one. A slot that has ended with no live dose is missed; a refused
// or not-given dose still accounts for it.
//
// The animal's pages, the shelter's dose sheet, the dose service and the
// attention queue all read slots through this module, so they agree on what
// was due and what was missed. Pure: plain data in, no Prisma client and no
// clock, so the unit tests can pin every branch.

import {
  DOSE_SLOT_LABELS,
  DOSE_SLOT_ORDER,
} from "@/app/lib/constants/medical";
import {
  formatShelterDay,
  shelterDaysBetweenKeys,
  shiftDayKey,
  type CalendarDay,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import type {
  DoseSlot,
  MedicationDoseResult,
  MedicationFrequency,
} from "@/prisma/generated/enums";

/** When each slot's window ends, as `"HH:mm"` on the shelter's clock. */
export type DoseSlotEnds = Record<DoseSlot, string>;

/** What the slot rules read of an order. */
export interface SlotOrder {
  frequency: MedicationFrequency;
  /** Days between doses, for `EVERY_N_DAYS` only. */
  intervalDays: number | null;
  startDate: CalendarDay;
  /** The frequency's first slot due on the start day. Null for `PRN`. */
  firstSlot: DoseSlot | null;
  /** The last day it runs, inclusive. */
  endDate: CalendarDay | null;
  /** The first day it no longer runs. */
  discontinuedDate: CalendarDay | null;
  voided: boolean;
}

/** One slot an order expects: a day and a named time of it. */
export interface ExpectedSlot {
  slotDate: CalendarDay;
  slot: DoseSlot;
}

export type SlotState = MedicationDoseResult | "MISSED" | "DUE";

export type OrderState =
  | "VOIDED"
  | "DISCONTINUED"
  | "UPCOMING"
  | "ENDED"
  | "ACTIVE";

const SLOTS: Record<MedicationFrequency, readonly DoseSlot[]> = {
  SID: ["AM"],
  BID: ["AM", "PM"],
  TID: ["AM", "MIDDAY", "PM"],
  EVERY_N_DAYS: ["AM"],
  PRN: [],
};

/** The slots a frequency expects on each day it is due, in the day's order. */
export const slotsFor = (frequency: MedicationFrequency): readonly DoseSlot[] =>
  SLOTS[frequency];

const slotIndex = (slot: DoseSlot) => DOSE_SLOT_ORDER.indexOf(slot);

/**
 * The last day an order runs: its end day, or the day before it was
 * discontinued, whichever is earlier. Null while it runs with no end. Before
 * its start day when it was discontinued before it began.
 */
export const orderLastDay = (order: SlotOrder): CalendarDay | null => {
  const beforeDiscontinued = order.discontinuedDate
    ? shiftDayKey(order.discontinuedDate, -1)
    : null;
  if (order.endDate && beforeDiscontinued) {
    return order.endDate < beforeDiscontinued ? order.endDate : beforeDiscontinued;
  }
  return order.endDate ?? beforeDiscontinued;
};

/** The slots the order expects on `day`, a day it is due within its run:
 * on the start day, only those from its first slot on. */
const slotsOnDay = (order: SlotOrder, day: CalendarDay): readonly DoseSlot[] => {
  const slots = slotsFor(order.frequency);
  if (day !== order.startDate || !order.firstSlot) return slots;
  const first = slotIndex(order.firstSlot);
  return slots.filter((slot) => slotIndex(slot) >= first);
};

/** Whether an every-few-days order is due on `day`, on or after its start. */
const isIntervalDay = (order: SlotOrder, day: CalendarDay) =>
  order.frequency !== "EVERY_N_DAYS" ||
  shelterDaysBetweenKeys(order.startDate, day) % (order.intervalDays ?? 1) === 0;

/**
 * Every slot the order expects from `fromDay` through `toDay`, inclusive, in
 * day and then slot order. None for a voided or as-needed order.
 */
export const expectedSlots = (
  order: SlotOrder,
  fromDay: CalendarDay,
  toDay: CalendarDay,
): ExpectedSlot[] => {
  if (order.voided || order.frequency === "PRN") return [];
  const lastDay = orderLastDay(order);
  const first = fromDay > order.startDate ? fromDay : order.startDate;
  const last = lastDay !== null && lastDay < toDay ? lastDay : toDay;
  const step = order.frequency === "EVERY_N_DAYS" ? (order.intervalDays ?? 1) : 1;

  // An every-few-days order's first due day on or after `first`.
  let day = first;
  if (step > 1) {
    const behind = shelterDaysBetweenKeys(order.startDate, first) % step;
    if (behind > 0) day = shiftDayKey(first, step - behind);
  }

  const slots: ExpectedSlot[] = [];
  for (; day <= last; day = shiftDayKey(day, step)) {
    for (const slot of slotsOnDay(order, day)) slots.push({ slotDate: day, slot });
  }
  return slots;
};

/** Whether a slot's window has ended on the shelter's clock. */
export const slotEnded = (
  { slotDate, slot }: ExpectedSlot,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): boolean =>
  slotDate < clock.day || (slotDate === clock.day && clock.time >= ends[slot]);

/**
 * A slot's state: what its live dose records, or with none, missed once its
 * window has ended and due until then.
 */
export const slotState = (
  slot: ExpectedSlot,
  dose: { result: MedicationDoseResult } | null,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): SlotState => {
  if (dose) return dose.result;
  return slotEnded(slot, clock, ends) ? "MISSED" : "DUE";
};

/**
 * Where an order stands on `today`: voided, then discontinued, then not yet
 * started, then past its end day, then active.
 */
export const orderState = (order: SlotOrder, today: CalendarDay): OrderState => {
  if (order.voided) return "VOIDED";
  if (order.discontinuedDate) return "DISCONTINUED";
  if (order.startDate > today) return "UPCOMING";
  if (order.endDate && order.endDate < today) return "ENDED";
  return "ACTIVE";
};

/**
 * Where a new order of `frequency` starts by default: today, at the first of
 * its slots whose window hasn't ended; when none is left today, tomorrow at
 * its first slot. An as-needed order starts today, with no slot.
 */
export const defaultStart = (
  frequency: MedicationFrequency,
  clock: ShelterClock,
  ends: DoseSlotEnds,
): { startDate: CalendarDay; firstSlot: DoseSlot | null } => {
  const slots = slotsFor(frequency);
  if (slots.length === 0) return { startDate: clock.day, firstSlot: null };
  const open = slots.find(
    (slot) => !slotEnded({ slotDate: clock.day, slot }, clock, ends),
  );
  return open
    ? { startDate: clock.day, firstSlot: open }
    : { startDate: shiftDayKey(clock.day, 1), firstSlot: slots[0] };
};

/** "the PM dose on Oct 14, 2026". */
const slotText = ({ slotDate, slot }: ExpectedSlot) =>
  `the ${DOSE_SLOT_LABELS[slot]} dose on ${formatShelterDay(slotDate)}`;

/**
 * Why a dose can't be recorded for `slot` (null for an as-needed dose) on
 * `slotDate`, or null when it can: any slot the order expects from its start
 * through today, today's later slots included.
 */
export const slotDoseIssue = (
  order: SlotOrder,
  { slotDate, slot }: { slotDate: CalendarDay; slot: DoseSlot | null },
  today: CalendarDay,
): string | null => {
  if (order.voided) return "This order was voided, so it takes no doses.";
  const slots = slotsFor(order.frequency);
  if (order.frequency === "PRN") {
    if (slot) return "An as-needed dose has no slot.";
  } else if (!slot) {
    return "A dose of this order needs its slot.";
  } else if (!slots.includes(slot)) {
    return `This order has no ${DOSE_SLOT_LABELS[slot]} dose.`;
  }
  if (slotDate > today) return "A dose can't be recorded for a future day.";
  if (slotDate < order.startDate) {
    return `This order starts on ${formatShelterDay(order.startDate)}.`;
  }
  const lastDay = orderLastDay(order);
  if (lastDay !== null && slotDate > lastDay) {
    return order.discontinuedDate && slotDate >= order.discontinuedDate
      ? `This order was discontinued from ${formatShelterDay(order.discontinuedDate)}.`
      : `This order ended on ${formatShelterDay(lastDay)}.`;
  }
  if (!isIntervalDay(order, slotDate)) {
    return `This order isn't due on ${formatShelterDay(slotDate)}: it is given every ${order.intervalDays} days from ${formatShelterDay(order.startDate)}.`;
  }
  if (slot && !slotsOnDay(order, slotDate).includes(slot)) {
    return `This order's first dose is ${slotText({
      slotDate: order.startDate,
      slot: order.firstSlot ?? slots[0],
    })}.`;
  }
  return null;
};
