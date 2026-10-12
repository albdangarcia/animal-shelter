import { z } from "zod";
import {
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
  TestResult,
} from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  MAX_BATCH_SIZE,
  MEDICAL_REASON_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import { cuidSchema } from "./common.schemas";

// The entry forms' view of a medical entry, one shape per kind. The rules that
// need nothing but the form's own values are mirrored from the entry service
// so the form can show them before submit; the service stays the authority,
// and checks everything that needs the item or the animal.

export const RABIES_MAX_MONTHS = 36;

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

/** A day that must be given. */
const requiredDay = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .min(1, `${label} is required.`)
    .transform((value, ctx): CalendarDay => {
      const day = parseCalendarDay(value);
      if (day === null) {
        ctx.addIssue({ code: "custom", message: `${label} isn't a valid date.` });
        return z.NEVER;
      }
      return day;
    });

/**
 * A due day. Whether it is in range needs the shelter's today, so the service
 * checks that.
 */
const dueDate = requiredDay("The due date");

/**
 * The kinds a Medical list is filtered to, from the URL's comma-separated
 * `kind`. A `kind` given more than once arrives as a list, and counts every
 * value. An unknown kind is ignored rather than refused; none means every
 * kind.
 */
export const medicalEntryKindsParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => [
    ...new Set(
      [value ?? []]
        .flat()
        .flatMap((part) => part.split(","))
        .filter((kind): kind is MedicalEntryKind =>
          Object.values(MedicalEntryKind).includes(kind as MedicalEntryKind),
        ),
    ),
  ]);

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
  // Recording can schedule the next dose of an item that repeats. Whether it
  // repeats, and whether one is already scheduled, needs the catalog and the
  // animal, so the service checks that.
  scheduleNext: z
    .object({ dueDate })
    .nullish()
    .transform((value) => value ?? null),
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

/** The rules for care given that need only the form's own values. */
const givenCareRules = (
  entry: {
    kind: MedicalEntryKind;
    completedDate: CalendarDay | null;
    source: MedicalEntrySource;
    vetPartnerId: string | null;
    vetName: string | null;
    doseAmount?: number | null;
    doseUnit?: DoseUnit | null;
  },
  ctx: z.RefinementCtx,
) => {
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
    entry.doseAmount != null &&
    !entry.doseUnit
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["doseUnit"],
      message: "A dose needs a unit.",
    });
  }
};

export const MedicalEntryFormSchema = z
  .discriminatedUnion("kind", [
    VaccineEntrySchema,
    TestEntrySchema,
    TreatmentEntrySchema,
  ])
  .superRefine(givenCareRules);

export type MedicalEntryFormInput = z.input<typeof MedicalEntryFormSchema>;

/**
 * The entry form's field errors from a failed parse, keyed where the form
 * shows them: a field inside an object by its dotted path
 * (`scheduleNext.dueDate`, as the service keys its own refusals), and
 * anything inside a list on the list itself (`results`), which shows one
 * message for all its rows.
 */
export const medicalEntryFieldErrors = (
  error: z.ZodError,
): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const listAt = issue.path.findIndex((key) => typeof key !== "string");
    const key = (listAt === -1 ? issue.path : issue.path.slice(0, listAt)).join(".");
    if (!key) continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
};
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

/** Care to schedule. */
export const ScheduleMedicalEntrySchema = z.object({
  kind: z.enum(MedicalEntryKind, { error: "Choose what to schedule." }),
  itemId: common.itemId,
  dueDate,
  notes: common.notes,
});

export type ScheduleMedicalEntryFormInput = z.input<
  typeof ScheduleMedicalEntrySchema
>;

/** A new due day for scheduled care. The service refuses the same day. */
export const RescheduleMedicalEntrySchema = z.object({ dueDate });

export type RescheduleMedicalEntryInput = z.input<
  typeof RescheduleMedicalEntrySchema
>;

const reason = (required: string) =>
  z
    .string()
    .trim()
    .min(1, { error: required })
    .max(MEDICAL_REASON_MAX_LENGTH, {
      error: `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`,
    });

export const VoidMedicalEntrySchema = z.object({
  reason: reason("A reason for voiding this entry is required."),
});

export type VoidMedicalEntryInput = z.input<typeof VoidMedicalEntrySchema>;

export const DeclineMedicalEntrySchema = z.object({
  reason: reason("A reason for declining this entry is required."),
});

export type DeclineMedicalEntryInput = z.input<typeof DeclineMedicalEntrySchema>;

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------
//
// One vaccine or treatment for several animals. Tests aren't batched, since
// each animal has its own results. Care given in a batch was given together,
// in house or by an outside vet, so it has a known day and is never before
// intake. A rabies vaccine shares its duration, and each animal carries its
// own optional tag.

const batchKind = z.enum([MedicalEntryKind.VACCINE, MedicalEntryKind.TREATMENT], {
  error: "Choose a vaccine or a treatment.",
});

const batchGiven = {
  completedDate: requiredDay("The date given"),
  source: z.enum([MedicalEntrySource.IN_HOUSE, MedicalEntrySource.OUTSIDE_VET], {
    error: "Choose how it was given.",
  }),
};

const BatchVaccineSchema = VaccineEntrySchema.omit({
  rabiesTagNumber: true,
}).extend(batchGiven);

const BatchTreatmentSchema = TreatmentEntrySchema.extend(batchGiven);

const rabiesTagNumber = optionalText(100);

const batchList = <T extends z.ZodType>(row: T, noun: string) =>
  z
    .array(row)
    .min(1, `Pick at least one ${noun}.`)
    .max(MAX_BATCH_SIZE, `A batch can cover at most ${MAX_BATCH_SIZE} animals.`);

const batchAnimals = batchList(
  z.object({ animalId: cuidSchema, rabiesTagNumber }),
  "animal",
);

/** Batch entry: one vaccine or treatment given to, or scheduled for, each
 * animal picked. */
export const MedicalBatchSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("SCHEDULE"),
    animals: batchAnimals,
    kind: batchKind,
    itemId: common.itemId,
    dueDate,
    notes: common.notes,
  }),
  z
    .discriminatedUnion("kind", [
      BatchVaccineSchema.extend({
        mode: z.literal("RECORD"),
        animals: batchAnimals,
      }),
      BatchTreatmentSchema.extend({
        mode: z.literal("RECORD"),
        animals: batchAnimals,
      }),
    ])
    .superRefine(givenCareRules),
]);

export type MedicalBatchFormInput = z.input<typeof MedicalBatchSchema>;
export type MedicalBatchFormValues = z.output<typeof MedicalBatchSchema>;

const batchEntries = batchList(
  z.object({ entryId: cuidSchema, rabiesTagNumber }),
  "entry",
);

/**
 * Several scheduled entries for one item, recorded as given with the same
 * details. The item is the entries' own. Notes left empty keep each entry's.
 */
export const RecordScheduledBatchSchema = z
  .discriminatedUnion("kind", [
    BatchVaccineSchema.omit({ itemId: true }).extend({ entries: batchEntries }),
    BatchTreatmentSchema.omit({ itemId: true }).extend({ entries: batchEntries }),
  ])
  .superRefine(givenCareRules);

export type RecordScheduledBatchFormInput = z.input<
  typeof RecordScheduledBatchSchema
>;
export type RecordScheduledBatchFormValues = z.output<
  typeof RecordScheduledBatchSchema
>;
