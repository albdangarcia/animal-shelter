// How an animal's medication orders read on its Medical pages: where each
// order stands, its slots on the days shown with their states, which of them
// can take a dose, and its doses counted over its run. Pure functions of what
// `medication.ts` reads, the shelter's clock and the dose times, with no
// Prisma import, so unit tests and the pages can use them. Which slots an
// order expects, and their states, come from `medication-slots.ts`. The time
// a dose was given is written here, on the shelter's clock, so the browser
// never needs the zone.

import type { DoseSlot, MedicationDoseResult } from "@/prisma/generated/enums";
import { DOSE_SHEET_PAST_DAYS } from "@/app/lib/constants/medical";
import {
  formatShelterDay,
  formatTimeOfDay,
  shelterClock,
  shiftDayKey,
  type CalendarDay,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import {
  expectedSlots,
  orderLastDay,
  orderState,
  slotState,
  slotsFor,
  type DoseSlotEnds,
  type OrderState,
  type SlotState,
} from "@/app/lib/utils/medication-slots";
import { doseSlotText, orderLineText } from "@/app/lib/services/medication-text";
import type {
  AnimalMedicationDose,
  AnimalMedicationOrder,
  AnimalMedications,
} from "./medication";

/** What the views read besides the orders: the shelter's time, its dose
 * times and zone, and the names behind the ids the orders hold. */
export interface MedicationViewContext {
  today: CalendarDay;
  clock: ShelterClock;
  ends: DoseSlotEnds;
  timezone: string;
  names: Record<string, string>;
}

/** A dose as a slot shows it. */
export interface DoseView {
  id: string;
  result: MedicationDoseResult;
  reason: string | null;
  notes: string | null;
  /**
   * When it was given or tried, on the shelter's clock: "8:12 AM", or with
   * its day when that isn't the slot's: "Oct 15, 2026, 8:12 AM".
   */
  givenAt: string;
  givenBy: string;
  voided: boolean;
  voidedBy: string | null;
  voidReason: string | null;
}

/** One slot of an order on one day, or an as-needed order's day. */
export interface SlotView {
  /** Unique on a page: the order, the day and the slot. */
  key: string;
  orderId: string;
  slotDate: CalendarDay;
  /** Null for an as-needed order's day. */
  slot: DoseSlot | null;
  /** Whether the order expects a dose in it. Never for an as-needed day. */
  expected: boolean;
  /**
   * Its state: what its live dose records, or missed or due. Null for a slot
   * the order doesn't expect that day and that holds no dose, and for an
   * as-needed day.
   */
  state: SlotState | null;
  /** Its live dose, or an as-needed day's live doses, in the order given. */
  doses: DoseView[];
  /** Doses voided on it, kept to show what happened. */
  voidedDoses: DoseView[];
  /**
   * Whether a dose can be recorded on it: the order takes one there (an
   * expected slot with none live yet; a day an as-needed order runs) and the
   * day isn't after today.
   */
  recordable: boolean;
  /** "Doxycycline, AM dose on Oct 14, 2026": names its controls. */
  label: string;
}

/** An order's slots on one day, in the day's order. */
export interface DayView {
  day: CalendarDay;
  slots: SlotView[];
}

/** An order's doses over its run: those recorded, and the slots missed. */
export interface DoseCounts {
  given: number;
  refused: number;
  notGiven: number;
  missed: number;
}

/** An order as a row reads it, wherever it is listed. */
export interface OrderSummary {
  order: AnimalMedicationOrder;
  state: OrderState;
  /** "Doxycycline · 100 mg oral · twice a day · Oct 12, 2026 to Nov 10, 2026". */
  line: string;
  /** "Active", "Starts Oct 20, 2026", "Ended Oct 8, 2026", "Discontinued
   * from Oct 14, 2026" or "Voided". */
  stateText: string;
}

/** A day of an order's whole run. */
export interface RunDayView extends DayView {
  /**
   * Whether the page shows this day with its controls elsewhere: today's
   * slots of an active order, or a day on the dose sheet. The run lists it
   * to read only, so no slot has its controls twice.
   */
  elsewhere: boolean;
}

/** An order as the Medications page shows it. */
export interface OrderView extends OrderSummary {
  /** Today's slots, for an active order; none otherwise. */
  today: SlotView[];
  /** Its days on the dose sheet, newest first: none for a voided order, or
   * one with no day there. */
  sheet: DayView[];
  /** Its doses over its run, and the slots it missed; null for a voided
   * order, whose doses count for nothing. */
  counts: DoseCounts | null;
  /**
   * Every day of its run through today with a slot or a dose, newest first,
   * and any earlier day still holding a dose (one voided before its start
   * was corrected). An as-needed order's days with a dose only.
   */
  run: RunDayView[];
  /**
   * For an as-needed order not voided, the days a dose can be recorded on:
   * from its start through its last day or today, whichever is earlier.
   * Null for any other order, or one not started.
   */
  asNeededDays: { from: CalendarDay; to: CalendarDay } | null;
}

export interface MedicationsView {
  /** Active and upcoming orders, latest start first. */
  current: OrderView[];
  /** The orders with a day on the dose sheet. */
  sheet: OrderView[];
  /** Ended, discontinued and voided orders, latest start first. */
  past: OrderView[];
  /** The dose sheet's days: as far back as the dose sheets go, through
   * yesterday. Today's slots are listed with each active order. */
  sheetFrom: CalendarDay;
  sheetTo: CalendarDay;
}

/**
 * When a dose was given or tried, on the shelter's clock: "8:12 AM", or with
 * its day when that isn't the slot's: "Oct 15, 2026, 8:12 AM".
 */
export const givenAtText = (
  administeredAt: Date,
  slotDate: CalendarDay,
  timezone: string,
): string => {
  const given = shelterClock(administeredAt, timezone);
  const time = formatTimeOfDay(given.time);
  return given.day === slotDate ? time : `${formatShelterDay(given.day)}, ${time}`;
};

const doseView = (
  dose: AnimalMedicationDose,
  { timezone, names }: MedicationViewContext,
): DoseView => {
  return {
    id: dose.id,
    result: dose.result,
    reason: dose.reason,
    notes: dose.notes,
    givenAt: givenAtText(dose.administeredAt, dose.slotDate, timezone),
    givenBy: names[dose.administeredById] ?? "someone",
    voided: dose.voided,
    voidedBy: dose.voidedById ? (names[dose.voidedById] ?? "someone") : null,
    voidReason: dose.voidReason,
  };
};

/** Where an order stands on today, and its line. */
export const orderSummary = (
  order: AnimalMedicationOrder,
  today: CalendarDay,
): OrderSummary => {
  const state = orderState(order.slotOrder, today);
  const stateText = (() => {
    switch (state) {
      case "VOIDED":
        return "Voided";
      case "DISCONTINUED":
        return `Discontinued from ${formatShelterDay(order.discontinuedDate!)}`;
      case "UPCOMING":
        return `Starts ${formatShelterDay(order.startDate)}`;
      case "ENDED":
        return `Ended ${formatShelterDay(order.endDate!)}`;
      case "ACTIVE":
        return "Active";
    }
  })();
  return { order, state, line: orderLineText(order), stateText };
};

/** The days from `from` through `to`, newest first. */
const daysDown = (from: CalendarDay, to: CalendarDay): CalendarDay[] => {
  const days: CalendarDay[] = [];
  for (let day = to; day >= from; day = shiftDayKey(day, -1)) days.push(day);
  return days;
};

/**
 * An order's days from `from` through `to`, newest first: each day it
 * expects a slot or holds a dose, with every slot of its frequency (a slot it
 * doesn't expect that day reads with no state). An as-needed order lists the
 * days with a dose, and, with `idleDays`, every day it runs.
 */
export const orderDays = (
  order: AnimalMedicationOrder,
  from: CalendarDay,
  to: CalendarDay,
  context: MedicationViewContext,
  { idleDays = false }: { idleDays?: boolean } = {},
): DayView[] => {
  if (to < from) return [];
  const { today, clock, ends } = context;
  const slotOrder = order.slotOrder;
  const doses = order.doses.filter((dose) => dose.slotDate >= from && dose.slotDate <= to);
  const label = (slotDate: CalendarDay, slot: DoseSlot | null) =>
    `${order.itemName}, ${doseSlotText({ slotDate, slot })}`;

  if (order.frequency === "PRN") {
    const lastDay = orderLastDay(slotOrder);
    const runs = (day: CalendarDay) =>
      !slotOrder.voided && day >= order.startDate && (lastDay === null || day <= lastDay);
    const days = new Set(doses.map((dose) => dose.slotDate));
    if (idleDays) {
      for (const day of daysDown(from, to)) if (runs(day)) days.add(day);
    }
    return [...days].sort().reverse().map((day) => {
      const onDay = doses.filter((dose) => dose.slotDate === day);
      return {
        day,
        slots: [
          {
            key: `${order.id}:${day}:PRN`,
            orderId: order.id,
            slotDate: day,
            slot: null,
            expected: false,
            state: null,
            doses: onDay.filter((dose) => !dose.voided).map((dose) => doseView(dose, context)),
            voidedDoses: onDay.filter((dose) => dose.voided).map((dose) => doseView(dose, context)),
            recordable: runs(day) && day <= today,
            label: label(day, null),
          },
        ],
      };
    });
  }

  const slots = expectedSlots(slotOrder, from, to);
  const expected = new Set(slots.map(({ slotDate, slot }) => `${slotDate}:${slot}`));
  const days = new Set([
    ...slots.map(({ slotDate }) => slotDate),
    ...doses.map((dose) => dose.slotDate),
  ]);
  return [...days].sort().reverse().map((day) => ({
    day,
    slots: slotsFor(order.frequency).map((slot): SlotView => {
      const onSlot = doses.filter((dose) => dose.slotDate === day && dose.slot === slot);
      const live = onSlot.find((dose) => !dose.voided) ?? null;
      const isExpected = expected.has(`${day}:${slot}`);
      return {
        key: `${order.id}:${day}:${slot}`,
        orderId: order.id,
        slotDate: day,
        slot,
        expected: isExpected,
        state: isExpected
          ? slotState({ slotDate: day, slot }, live, clock, ends)
          : (live?.result ?? null),
        doses: live ? [doseView(live, context)] : [],
        voidedDoses: onSlot.filter((dose) => dose.voided).map((dose) => doseView(dose, context)),
        recordable: isExpected && !live && day <= today,
        label: label(day, slot),
      };
    }),
  }));
};

/** The doses recorded over an order's days, and the slots it missed. */
export const doseCounts = (days: DayView[]): DoseCounts => {
  const counts: DoseCounts = { given: 0, refused: 0, notGiven: 0, missed: 0 };
  for (const { slots } of days) {
    for (const slot of slots) {
      if (slot.state === "MISSED") counts.missed += 1;
      for (const dose of slot.doses) {
        if (dose.result === "GIVEN") counts.given += 1;
        else if (dose.result === "REFUSED") counts.refused += 1;
        else counts.notGiven += 1;
      }
    }
  }
  return counts;
};

const orderView = (
  order: AnimalMedicationOrder,
  context: MedicationViewContext,
  sheetFrom: CalendarDay,
  sheetTo: CalendarDay,
): OrderView => {
  const { today } = context;
  const summary = orderSummary(order, today);
  const active = summary.state === "ACTIVE";
  const voided = summary.state === "VOIDED";
  // A dose can sit before the start: voided, then the start corrected.
  const runFrom = [order.startDate, ...order.doses.map((dose) => dose.slotDate)].sort()[0];
  const run = orderDays(order, runFrom, today, context);
  const lastDay = orderLastDay(order.slotOrder);
  const asNeededTo = lastDay !== null && lastDay < today ? lastDay : today;
  return {
    ...summary,
    today: active
      ? (orderDays(order, today, today, context, { idleDays: true })[0]?.slots ?? [])
      : [],
    sheet: voided ? [] : orderDays(order, sheetFrom, sheetTo, context, { idleDays: true }),
    counts: voided ? null : doseCounts(run),
    asNeededDays:
      order.frequency === "PRN" && !voided && order.startDate <= asNeededTo
        ? { from: order.startDate, to: asNeededTo }
        : null,
    run: run.map((day) => ({
      ...day,
      elsewhere:
        (active && day.day === today) ||
        (!voided && day.day >= sheetFrom && day.day <= sheetTo),
    })),
  };
};

/**
 * The Medications page: the active and upcoming orders, with today's slots;
 * the dose sheet, the days before today as far back as the dose sheets go,
 * for each order not voided with a day there; and the ended, discontinued
 * and voided orders. Every order carries its whole run and its counts.
 */
export const medicationsView = (
  { orders }: AnimalMedications,
  context: MedicationViewContext,
): MedicationsView => {
  const sheetFrom = shiftDayKey(context.today, -DOSE_SHEET_PAST_DAYS);
  const sheetTo = shiftDayKey(context.today, -1);
  const views = orders.map((order) => orderView(order, context, sheetFrom, sheetTo));
  const isCurrent = (view: OrderView) => view.state === "ACTIVE" || view.state === "UPCOMING";
  return {
    current: views.filter(isCurrent),
    sheet: views.filter((view) => view.sheet.length > 0),
    past: views.filter((view) => !isCurrent(view)),
    sheetFrom,
    sheetTo,
  };
};

/** One order's slots today, as Overview lists them. */
export interface TodaysDoseRow {
  summary: OrderSummary;
  slots: SlotView[];
}

/**
 * Overview's "Today's doses": each order's slots today (an active as-needed
 * order's day among them), or null when no order expects a slot today and
 * none as needed is active. An order that only holds a dose today, one
 * discontinued from today, is listed beside the others but doesn't make the
 * section show.
 */
export const todaysDoses = (
  { orders }: AnimalMedications,
  context: MedicationViewContext,
): TodaysDoseRow[] | null => {
  const { today } = context;
  const rows = orders.flatMap((order): TodaysDoseRow[] => {
    const summary = orderSummary(order, today);
    if (summary.state === "VOIDED") return [];
    const slots =
      orderDays(order, today, today, context, { idleDays: summary.state === "ACTIVE" })[0]
        ?.slots ?? [];
    return slots.length > 0 ? [{ summary, slots }] : [];
  });
  const shows = rows.some(
    ({ summary, slots }) =>
      slots.some((slot) => slot.expected) ||
      (summary.order.frequency === "PRN" && summary.state === "ACTIVE"),
  );
  return shows ? rows : null;
};
