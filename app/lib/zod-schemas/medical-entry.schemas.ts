import { z } from "zod";
import {
  DoseUnit,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
  ReproductiveStatus,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
  TestResult,
} from "@/prisma/generated/enums";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  CATALOG_ENTRY_KINDS,
  MAX_BATCH_SIZE,
  MEDICAL_REASON_MAX_LENGTH,
  type CatalogEntryKind,
} from "@/app/lib/constants/medical";
import { chipNumberIssue, normaliseChipNumber } from "@/app/lib/utils/microchip";
import { examFindingsIssue } from "@/app/lib/utils/exam-findings";
import { cuidSchema } from "./common.schemas";
import {
  VitalsMeasurementsSchema,
  hasVitalsMeasurement,
} from "./vitals.schemas";

// The entry forms' view of a medical entry, one shape per kind. The rules that
// need nothing but the form's own values are mirrored from the entry service
// so the form can show them before submit; the service stays the authority,
// and checks everything that needs the item or the animal.

export const RABIES_MAX_MONTHS = 36;

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

/** A day that may be left empty: "" and null both read as no day. */
export const optionalDay = (label: string) =>
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
export const requiredDay = (label: string) =>
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

/** What History lists besides entries: problem-list rows and care episodes. */
export const MEDICAL_HISTORY_RECORD_KINDS = ["CONDITION", "CARE_EPISODE"] as const;

/** A value of History's kind filter: an entry kind, or one of the records
 * History lists beside entries. */
export type MedicalHistoryKind =
  | MedicalEntryKind
  | (typeof MEDICAL_HISTORY_RECORD_KINDS)[number];

const MEDICAL_HISTORY_KINDS: readonly string[] = [
  ...Object.values(MedicalEntryKind),
  ...MEDICAL_HISTORY_RECORD_KINDS,
];

/**
 * History's kind filter, read from the URL as `medicalEntryKindsParam` reads
 * it: the entry kinds, plus CONDITION and CARE_EPISODE. None means every
 * kind of record.
 */
export const medicalHistoryKindsParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => [
    ...new Set(
      [value ?? []]
        .flat()
        .flatMap((part) => part.split(","))
        .filter((kind): kind is MedicalHistoryKind => MEDICAL_HISTORY_KINDS.includes(kind)),
    ),
  ]);

export const optionalId = cuidSchema
  .nullish()
  .or(z.literal(""))
  .transform((value) => value || null);

// What every kind of care given shares.
const given = {
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

// Care given from the catalog names its item.
const common = {
  itemId: z.string({ error: "Pick an item." }).min(1, "Pick an item."),
  ...given,
};

const route = z.enum(MedicalRoute).nullish().transform((v) => v ?? null);

const procedure = z.enum(SurgeryProcedure, { error: "Pick the procedure." });

const examType = z.enum(ExamType, { error: "Pick the exam type." });

/** A choice that may be left empty: "" and null both read as none. */
export const optionalChoice = <T extends z.ZodType>(schema: T) =>
  schema
    .nullish()
    .or(z.literal(""))
    .transform((value) => (value || null) as z.output<T> | null);

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

// A surgery has no catalog item: its procedure says what it was. Whether a
// spay or neuter suits the animal needs the animal, so the service checks
// that.
const SurgeryEntrySchema = z.object({
  kind: z.literal(MedicalEntryKind.SURGERY),
  ...given,
  procedure,
  surgeon: optionalText(200),
  findings: optionalText(2000),
  anesthesiaNotes: optionalText(2000),
  evidence: z.enum(SurgeryEvidence).nullish().transform((v) => v ?? null),
});

/** A chip number as typed, checked and passed on in its stored form. */
const chipNumber = z
  .string({ error: "The chip number is required." })
  .transform((value, ctx) => {
    const normalised = normaliseChipNumber(value);
    const issue = chipNumberIssue(normalised);
    if (issue) {
      ctx.addIssue({ code: "custom", message: issue });
      return z.NEVER;
    }
    return normalised;
  });

// A microchip has no catalog item: its number says which chip it is. Whether
// another entry holds the number needs the database, so the service checks
// that.
const MicrochipEntrySchema = z.object({
  kind: z.literal(MedicalEntryKind.MICROCHIP),
  ...given,
  chipNumber,
  brand: optionalText(100),
});

/**
 * Vitals measured during an exam, with the Vitals page's bounds. Left blank,
 * none were taken. When they were taken is worked out from the exam's day
 * when it is recorded.
 */
const examVitals = z
  .object({
    weightGrams: VitalsMeasurementsSchema.shape.weightGrams.nullish(),
    temperatureC: VitalsMeasurementsSchema.shape.temperatureC.nullish(),
    bodyConditionScore: VitalsMeasurementsSchema.shape.bodyConditionScore.nullish(),
  })
  .nullish()
  .transform((value) =>
    value && hasVitalsMeasurement(value)
      ? {
          weightGrams: value.weightGrams ?? null,
          temperatureC: value.temperatureC ?? null,
          bodyConditionScore: value.bodyConditionScore ?? null,
        }
      : null,
  );

// An exam has no catalog item: its type says which exam it was. Which body
// systems it must have a finding for depends on the exam (a correction is
// held to the systems it was recorded with), so the service checks that. The
// form's own values are checked here: no system twice, and a note on every
// abnormal finding. Recording one can bring the vitals measured during it,
// and the spay or neuter it found when it reads the animal as altered (whether
// the animal is already altered, and the procedure suits its sex, need the
// animal, so the service checks those). A correction takes neither.
const ExamEntrySchema = z
  .object({
    kind: z.literal(MedicalEntryKind.EXAM),
    ...given,
    examType,
    overallResult: z.enum(ExamResult, { error: "Pick the overall result." }),
    reproductiveStatus: optionalChoice(z.enum(ReproductiveStatus)),
    findings: z.array(
      z.object({
        bodySystem: z.string().min(1),
        status: z.enum(ExamFindingStatus, { error: "Choose a finding." }),
        notes: optionalText(2000),
      }),
    ),
    vitals: examVitals,
    foundAltered: z
      .object({
        procedure: z.enum([SurgeryProcedure.SPAY, SurgeryProcedure.NEUTER], {
          error: "Pick spay or neuter.",
        }),
      })
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine(({ findings, reproductiveStatus, foundAltered }, ctx) => {
    if (foundAltered && reproductiveStatus !== ReproductiveStatus.ALTERED) {
      ctx.addIssue({
        code: "custom",
        path: ["foundAltered"],
        message:
          "A spay or neuter is recorded with an exam only when the exam found the animal altered.",
      });
    }
    const issue = examFindingsIssue(findings, [
      ...new Set(findings.map((finding) => finding.bodySystem)),
    ]);
    if (issue) {
      ctx.addIssue({ code: "custom", path: ["findings"], message: issue });
    }
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
    evidence?: SurgeryEvidence | null;
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
  if (
    entry.kind === MedicalEntryKind.EXAM &&
    entry.source === MedicalEntrySource.BEFORE_INTAKE
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message: "An exam is recorded in house or by an outside vet.",
    });
  }
  if (entry.kind === MedicalEntryKind.SURGERY) {
    const beforeIntake = entry.source === MedicalEntrySource.BEFORE_INTAKE;
    if (beforeIntake && !entry.evidence) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Say what shows the surgery was done before intake.",
      });
    }
    if (!beforeIntake && entry.evidence) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Evidence is only for a surgery done before intake.",
      });
    }
  }
};

export const MedicalEntryFormSchema = z
  .discriminatedUnion("kind", [
    VaccineEntrySchema,
    TestEntrySchema,
    TreatmentEntrySchema,
    SurgeryEntrySchema,
    MicrochipEntrySchema,
    ExamEntrySchema,
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

const SCHEDULED_KINDS = [
  ...CATALOG_ENTRY_KINDS,
  MedicalEntryKind.SURGERY,
  MedicalEntryKind.MICROCHIP,
  MedicalEntryKind.EXAM,
] as const;

/**
 * Care to schedule: an item for care given from the catalog, a procedure for
 * a surgery, a type for an exam, and none of these for a microchip, whose
 * number is known once it is implanted. One object rather than a union, so a
 * blank form shows each field's own message.
 */
export const ScheduleMedicalEntrySchema = z
  .object({
    kind: z.enum(SCHEDULED_KINDS, { error: "Choose what to schedule." }),
    itemId: z.string().nullish(),
    // A form's empty choice is no procedure or type, as it is no item.
    procedure: optionalChoice(procedure),
    examType: optionalChoice(examType),
    dueDate,
    notes: common.notes,
  })
  .superRefine((value, ctx) => {
    if (value.kind === MedicalEntryKind.MICROCHIP) return;
    if (value.kind === MedicalEntryKind.EXAM) {
      if (!value.examType) {
        ctx.addIssue({
          code: "custom",
          path: ["examType"],
          message: "Pick the exam type.",
        });
      }
    } else if (value.kind === MedicalEntryKind.SURGERY) {
      if (!value.procedure) {
        ctx.addIssue({
          code: "custom",
          path: ["procedure"],
          message: "Pick the procedure.",
        });
      }
    } else if (!value.itemId) {
      ctx.addIssue({ code: "custom", path: ["itemId"], message: "Pick an item." });
    }
  }, {
    // Run even when another field is wrong, so a blank form shows every
    // message at once.
    when: ({ value }) => typeof value === "object" && value !== null,
  })
  .transform(
    ({ kind, itemId, procedure, examType, dueDate, notes }): { dueDate: CalendarDay; notes: string | null } & (
      | { kind: CatalogEntryKind; itemId: string }
      | { kind: typeof MedicalEntryKind.SURGERY; procedure: SurgeryProcedure }
      | { kind: typeof MedicalEntryKind.MICROCHIP }
      | { kind: typeof MedicalEntryKind.EXAM; examType: ExamType }
    ) => {
      // The refinement has checked that the kind's own field is there.
      switch (kind) {
        case MedicalEntryKind.MICROCHIP:
          return { kind, dueDate, notes };
        case MedicalEntryKind.SURGERY:
          return { kind, procedure: procedure!, dueDate, notes };
        case MedicalEntryKind.EXAM:
          return { kind, examType: examType!, dueDate, notes };
        default:
          return { kind, itemId: itemId!, dueDate, notes };
      }
    },
  );

export type ScheduleMedicalEntryFormInput = z.input<
  typeof ScheduleMedicalEntrySchema
>;

/** A new due day for scheduled care. The service refuses the same day. */
export const RescheduleMedicalEntrySchema = z.object({ dueDate });

export type RescheduleMedicalEntryInput = z.input<
  typeof RescheduleMedicalEntrySchema
>;

/** A reason that must be given, as a void needs. */
export const requiredReason = (required: string) =>
  z
    .string()
    .trim()
    .min(1, { error: required })
    .max(MEDICAL_REASON_MAX_LENGTH, {
      error: `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`,
    });

export const VoidMedicalEntrySchema = z.object({
  reason: requiredReason("A reason for voiding this entry is required."),
});

export type VoidMedicalEntryInput = z.input<typeof VoidMedicalEntrySchema>;

/**
 * An exemption from a spay or neuter: a reason from the list, and maybe a
 * day to review it. Whether the review day is in range needs the shelter's
 * today, so the service checks that. Shared by recording an exemption and by
 * declining a scheduled spay or neuter.
 */
export const SpayNeuterExemptionSchema = z.object({
  exemptionReason: z.enum(SpayNeuterExemptionReason, {
    error: "Pick the reason for the exemption.",
  }),
  reviewDate: optionalDay("The review date"),
});

const OTHER_NEEDS_NOTE = "Say why the animal is exempt.";

const optionalReason = z
  .string()
  .trim()
  .max(MEDICAL_REASON_MAX_LENGTH, {
    error: `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`,
  })
  .nullish()
  .transform((value) => value || null);

/**
 * Declining scheduled care. Most care needs the reason in words. A spay or
 * neuter is declined as an exemption, with a reason from the list and maybe
 * a review day, and needs words only for Other. Whether the entry is a spay
 * or neuter needs the entry, so the service checks which applies. Flat, so
 * each message is keyed by the field the form shows it under.
 */
export const DeclineMedicalEntrySchema = z
  .object({
    reason: optionalReason,
    exemptionReason: SpayNeuterExemptionSchema.shape.exemptionReason
      .nullish()
      .transform((value) => value ?? null),
    reviewDate: SpayNeuterExemptionSchema.shape.reviewDate,
  })
  .superRefine(({ reason, exemptionReason, reviewDate }, ctx) => {
    if (!exemptionReason) {
      if (reviewDate) {
        ctx.addIssue({
          code: "custom",
          path: ["exemptionReason"],
          message: "Pick the reason for the exemption.",
        });
      } else if (!reason) {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "A reason for declining this entry is required.",
        });
      }
    } else if (exemptionReason === SpayNeuterExemptionReason.OTHER && !reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: OTHER_NEEDS_NOTE });
    }
  });

export type DeclineMedicalEntryInput = z.input<typeof DeclineMedicalEntrySchema>;

const otherNeedsNote = (
  { exemptionReason, declineReason }: {
    exemptionReason: SpayNeuterExemptionReason;
    declineReason: string | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (exemptionReason === SpayNeuterExemptionReason.OTHER && !declineReason) {
    ctx.addIssue({ code: "custom", path: ["declineReason"], message: OTHER_NEEDS_NOTE });
  }
};

/**
 * An exemption's terms as its form holds them: the reason from the list, the
 * note in words (`declineReason`, required for Other) and maybe a review day.
 * The form declining a scheduled spay or neuter checks these, and sends the
 * note as the decline's `reason`.
 */
export const SpayNeuterExemptionTermsSchema = SpayNeuterExemptionSchema.extend({
  declineReason: optionalReason,
}).superRefine(otherNeedsNote);

/** An exemption recorded on its own, with no spay or neuter scheduled first. */
export const RecordSpayNeuterExemptionSchema = SpayNeuterExemptionSchema.extend({
  procedure: z.enum([SurgeryProcedure.SPAY, SurgeryProcedure.NEUTER], {
    error: "Pick spay or neuter.",
  }),
  declineReason: optionalReason,
}).superRefine(otherNeedsNote);

export type RecordSpayNeuterExemptionFormInput = z.input<
  typeof RecordSpayNeuterExemptionSchema
>;

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
