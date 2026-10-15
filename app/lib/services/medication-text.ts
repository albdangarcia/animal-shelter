// How medication orders and doses read in the activity feed and on the
// pages: a dose in words, how often, an order's line, and a slot. Pure: no
// Prisma client, so the services, the reads and the pages share the words.

import {
  DOSE_SLOT_LABELS,
  MEDICAL_ROUTE_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";
import { formatShelterDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import type {
  DoseSlot,
  DoseUnit,
  MedicalRoute,
  MedicationFrequency,
} from "@/prisma/generated/enums";

/** A route as a sentence names it: "oral", "subcutaneous", "ophthalmic". */
export const routeText = (route: MedicalRoute): string =>
  MEDICAL_ROUTE_LABELS[route].replace(/\s*\(.*\)$/, "").toLowerCase();

/** "100 mg oral", "1 tablet oral", "2 drops ophthalmic". */
export const doseText = (amount: number, unit: DoseUnit, route: MedicalRoute): string =>
  `${formatDose(amount, unit)} ${routeText(route)}`;

/**
 * How often, in words: "once a day", "twice a day", "three times a day",
 * "every 3 days", "weekly" (every 7 days) and "as needed".
 */
export const frequencyText = (
  frequency: MedicationFrequency,
  intervalDays: number | null,
): string => {
  switch (frequency) {
    case "SID":
      return "once a day";
    case "BID":
      return "twice a day";
    case "TID":
      return "three times a day";
    case "EVERY_N_DAYS":
      return intervalDays === 7 ? "weekly" : `every ${intervalDays} days`;
    case "PRN":
      return "as needed";
  }
};

/** What an order's line reads of it. */
export interface OrderTextFields {
  itemName: string;
  doseAmount: number;
  doseUnit: DoseUnit;
  route: MedicalRoute;
  frequency: MedicationFrequency;
  intervalDays: number | null;
  startDate: CalendarDay;
  endDate: CalendarDay | null;
}

/** "from Oct 12, 2026 to Nov 10, 2026", "on Oct 12, 2026" or "from Oct 12, 2026". */
export const orderSpanText = (startDate: CalendarDay, endDate: CalendarDay | null) => {
  if (!endDate) return `from ${formatShelterDay(startDate)}`;
  if (endDate === startDate) return `on ${formatShelterDay(startDate)}`;
  return `from ${formatShelterDay(startDate)} to ${formatShelterDay(endDate)}`;
};

/** "Doxycycline 100 mg oral, twice a day". */
export const orderDoseText = (order: Omit<OrderTextFields, "startDate" | "endDate">) =>
  `${order.itemName} ${doseText(order.doseAmount, order.doseUnit, order.route)}, ${frequencyText(order.frequency, order.intervalDays)}`;

/** "Doxycycline 100 mg oral, twice a day, from Oct 12, 2026 to Nov 10, 2026". */
export const orderText = (order: OrderTextFields) =>
  `${orderDoseText(order)}, ${orderSpanText(order.startDate, order.endDate)}`;

/** "AM dose on Oct 14, 2026", or "as-needed dose on Oct 14, 2026" with no slot. */
export const doseSlotText = ({
  slotDate,
  slot,
}: {
  slotDate: CalendarDay;
  slot: DoseSlot | null;
}) => `${slot ? DOSE_SLOT_LABELS[slot] : "as-needed"} dose on ${formatShelterDay(slotDate)}`;
