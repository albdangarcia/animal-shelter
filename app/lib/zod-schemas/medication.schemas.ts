import { z } from "zod";
import {
  DoseSlot,
  DoseUnit,
  MedicalRoute,
  MedicationFrequency,
} from "@/prisma/generated/enums";
import {
  DOSE_SLOT_LABELS,
  MAX_EVERY_N_DAYS,
  MEDICATION_FREQUENCY_LABELS,
  MEDICATION_INSTRUCTIONS_MAX_LENGTH,
  MEDICATION_PRESCRIBED_BY_MAX_LENGTH,
  MIN_EVERY_N_DAYS,
} from "@/app/lib/constants/medical";
import { slotsFor } from "@/app/lib/utils/medication-slots";
import { cuidSchema } from "./common.schemas";
import {
  optionalChoice,
  optionalDay,
  optionalText,
  requiredDay,
  requiredReason,
} from "./medical-entry.schemas";

// The medication order forms' view of an order. The rules that need nothing
// but the form's own values (the frequency's interval and slots, the end
// after the start, the lengths) are mirrored from the order service so the
// form can show them before submit; the service stays the authority, and
// checks what needs the medication, the animal, its doses or today.

const instructions = optionalText(MEDICATION_INSTRUCTIONS_MAX_LENGTH);
const prescribedBy = optionalText(MEDICATION_PRESCRIBED_BY_MAX_LENGTH);
const firstSlot = optionalChoice(z.enum(DoseSlot));

type Issue = (path: string, message: string) => void;

const issuesOf =
  (ctx: z.RefinementCtx): Issue =>
  (path, message) =>
    ctx.addIssue({ code: "custom", path: [path], message });

/** The first slot is one of the frequency's; an as-needed order has none. */
const checkFirstSlot = (
  frequency: MedicationFrequency,
  slot: DoseSlot | null,
  issue: Issue,
) => {
  const slots = slotsFor(frequency);
  if (slots.length === 0) {
    if (slot) issue("firstSlot", "An as-needed order has no slots.");
  } else if (!slot) {
    issue("firstSlot", "Pick the slot of the first dose.");
  } else if (!slots.includes(slot)) {
    issue(
      "firstSlot",
      `An order given ${MEDICATION_FREQUENCY_LABELS[frequency].toLowerCase()} has no ${DOSE_SLOT_LABELS[slot]} dose.`,
    );
  }
};

const checkEnd = (
  startDate: string,
  endDate: string | null,
  issue: Issue,
) => {
  if (endDate && endDate < startDate) {
    issue("endDate", "The end date can't be before the start date.");
  }
};

/** Ordering a medication: what the order form sends. */
export const MedicationOrderFormSchema = z
  .object({
    itemId: cuidSchema.or(z.literal("")).refine((value) => value !== "", {
      error: "Pick a medication.",
    }),
    // A cleared number field holds null.
    doseAmount: z
      .number({ error: "Give the dose." })
      .positive("The dose must be more than 0."),
    doseUnit: z.enum(DoseUnit, { error: "Pick the dose's unit." }),
    route: z.enum(MedicalRoute, { error: "Pick the route." }),
    frequency: z.enum(MedicationFrequency, { error: "Pick how often." }),
    intervalDays: z
      .number()
      .int("Use a whole number of days.")
      .nullish()
      .transform((value) => value ?? null),
    startDate: requiredDay("The start date"),
    firstSlot,
    endDate: optionalDay("The end date"),
    instructions,
    prescribedBy,
  })
  .superRefine((order, ctx) => {
    const issue = issuesOf(ctx);
    if (order.frequency === MedicationFrequency.EVERY_N_DAYS) {
      if (order.intervalDays === null) {
        issue("intervalDays", "Give the days between doses.");
      } else if (
        order.intervalDays < MIN_EVERY_N_DAYS ||
        order.intervalDays > MAX_EVERY_N_DAYS
      ) {
        issue(
          "intervalDays",
          `An order given every few days is given every ${MIN_EVERY_N_DAYS} to ${MAX_EVERY_N_DAYS} days.`,
        );
      }
    } else if (order.intervalDays !== null) {
      issue("intervalDays", "Only an order given every few days has days between doses.");
    }
    checkFirstSlot(order.frequency, order.firstSlot, issue);
    checkEnd(order.startDate, order.endDate, issue);
  });

export type MedicationOrderFormInput = z.input<typeof MedicationOrderFormSchema>;
export type MedicationOrderFormValues = z.output<typeof MedicationOrderFormSchema>;

/**
 * Correcting an order: what the edit form sends, every field filled from
 * what is stored. The order's frequency comes with it, read only, so the
 * first slot can be checked against it; the medication, dose and frequency
 * themselves never change.
 */
export const MedicationOrderCorrectionSchema = z
  .object({
    frequency: z.enum(MedicationFrequency),
    startDate: requiredDay("The start date"),
    firstSlot,
    endDate: optionalDay("The end date"),
    instructions,
    prescribedBy,
  })
  .superRefine((order, ctx) => {
    const issue = issuesOf(ctx);
    checkFirstSlot(order.frequency, order.firstSlot, issue);
    checkEnd(order.startDate, order.endDate, issue);
  });

export type MedicationOrderCorrectionInput = z.input<typeof MedicationOrderCorrectionSchema>;
export type MedicationOrderCorrectionValues = z.output<typeof MedicationOrderCorrectionSchema>;

/** Discontinuing an order: from which day, and why. */
export const DiscontinueMedicationOrderSchema = z.object({
  day: requiredDay("The discontinue date"),
  reason: requiredReason("Say why the order is being discontinued."),
});

export type DiscontinueMedicationOrderInput = z.input<typeof DiscontinueMedicationOrderSchema>;

export const VoidMedicationOrderSchema = z.object({
  reason: requiredReason("A reason for voiding this order is required."),
});

export type VoidMedicationOrderInput = z.input<typeof VoidMedicationOrderSchema>;
