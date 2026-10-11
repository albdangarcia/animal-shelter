import { z } from "zod";
import {
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
  TestResult,
} from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { cuidSchema } from "./common.schemas";

// The entry forms' view of a medical entry, one shape per kind. The rules that
// need nothing but the form's own values are mirrored from the entry service
// so the form can show them before submit; the service stays the authority,
// and checks everything that needs the item or the animal.

export const RABIES_MAX_MONTHS = 36;
export const VOID_REASON_MAX_LENGTH = 1000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

/** A day that may be left empty: "" and null both read as no day. */
const optionalDay = (label: string) =>
  z
    .string()
    .nullish()
    .transform((value, ctx): CalendarDay | null => {
      if (!value) return null;
      const day = parseCalendarDay(value);
      if (day === null) {
        ctx.addIssue({ code: "custom", message: `${label} isn't a valid date.` });
        return z.NEVER;
      }
      return day;
    });

const optionalId = cuidSchema
  .nullish()
  .or(z.literal(""))
  .transform((value) => value || null);

const common = {
  itemId: z.string({ error: "Pick an item." }).min(1, "Pick an item."),
  completedDate: optionalDay("The date given"),
  source: z.enum(MedicalEntrySource),
  vetPartnerId: optionalId,
  vetName: optionalText(200),
  notes: optionalText(2000),
};

const route = z.enum(MedicalRoute).nullish().transform((v) => v ?? null);

const VaccineEntrySchema = z.object({
  kind: z.literal(MedicalEntryKind.VACCINE),
  ...common,
  manufacturer: optionalText(100),
  lotNumber: optionalText(100),
  lotExpiryDate: optionalDay("The lot expiry"),
  route,
  site: optionalText(100),
  rabiesTagNumber: optionalText(100),
  durationMonths: z
    .number()
    .int("Use a whole number of months.")
    .min(1, "At least one month.")
    .max(RABIES_MAX_MONTHS, `At most ${RABIES_MAX_MONTHS} months.`)
    .nullish()
    .transform((v) => v ?? null),
});

const TestEntrySchema = z.object({
  kind: z.literal(MedicalEntryKind.TEST),
  ...common,
  lotNumber: optionalText(100),
  lotExpiryDate: optionalDay("The lot expiry"),
  results: z.array(
    z.object({
      analyteId: z.string().min(1),
      result: z.enum(TestResult, { error: "Choose a result." }),
    }),
  ),
});

const TreatmentEntrySchema = z.object({
  kind: z.literal(MedicalEntryKind.TREATMENT),
  ...common,
  doseAmount: z
    .number()
    .positive("The dose must be more than zero.")
    .nullish()
    .transform((v) => v ?? null),
  doseUnit: z.enum(DoseUnit).nullish().transform((v) => v ?? null),
  route,
});

export const MedicalEntryFormSchema = z
  .discriminatedUnion("kind", [
    VaccineEntrySchema,
    TestEntrySchema,
    TreatmentEntrySchema,
  ])
  .superRefine((entry, ctx) => {
    if (
      entry.completedDate === null &&
      entry.source !== MedicalEntrySource.BEFORE_INTAKE
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["completedDate"],
        message:
          "The date given is required. Only care given before intake can have an unknown date.",
      });
    }
    if (entry.source === MedicalEntrySource.IN_HOUSE) {
      if (entry.vetPartnerId) {
        ctx.addIssue({
          code: "custom",
          path: ["vetPartnerId"],
          message: "A vet clinic is only for care given outside the shelter.",
        });
      }
      if (entry.vetName) {
        ctx.addIssue({
          code: "custom",
          path: ["vetName"],
          message: "A vet's name is only for care given outside the shelter.",
        });
      }
    }
    if (
      entry.kind === MedicalEntryKind.TREATMENT &&
      entry.doseAmount !== null &&
      !entry.doseUnit
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["doseUnit"],
        message: "A dose needs a unit.",
      });
    }
  });

export type MedicalEntryFormInput = z.input<typeof MedicalEntryFormSchema>;
export type MedicalEntryFormValues = z.output<typeof MedicalEntryFormSchema>;

/**
 * The rabies duration rule, which needs to know whether the picked item is a
 * rabies vaccine. The form runs it alongside the schema; the service enforces
 * it regardless.
 */
export const rabiesDurationIssue = (
  isRabies: boolean,
  durationMonths: number | null | undefined,
): string | null =>
  isRabies && (durationMonths === null || durationMonths === undefined)
    ? "A rabies vaccine needs its duration."
    : null;

/**
 * Care to schedule. Whether the due day is in range needs the shelter's today,
 * so the service checks that.
 */
export const ScheduleMedicalEntrySchema = z.object({
  kind: z.enum(MedicalEntryKind, { error: "Choose what to schedule." }),
  itemId: common.itemId,
  dueDate: z
    .string({ error: "The due date is required." })
    .min(1, "The due date is required.")
    .transform((value, ctx): CalendarDay => {
      const day = parseCalendarDay(value);
      if (day === null) {
        ctx.addIssue({ code: "custom", message: "The due date isn't a valid date." });
        return z.NEVER;
      }
      return day;
    }),
  notes: common.notes,
});

export type ScheduleMedicalEntryFormInput = z.input<
  typeof ScheduleMedicalEntrySchema
>;

export const VoidMedicalEntrySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: "A reason for voiding this entry is required." })
    .max(VOID_REASON_MAX_LENGTH, {
      error: `The reason cannot exceed ${VOID_REASON_MAX_LENGTH} characters.`,
    }),
});

export type VoidMedicalEntryInput = z.input<typeof VoidMedicalEntrySchema>;
