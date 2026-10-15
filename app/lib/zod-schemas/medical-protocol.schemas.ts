import { z } from "zod";
import {
  ExamType,
  MedicalProtocolStepKind,
} from "@/prisma/generated/enums";
import {
  MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS,
  MAX_PROTOCOL_OFFSET_DAYS,
  MAX_PROTOCOL_STEP_DOSES,
  MEDICAL_PROTOCOL_NAME_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";
import { cuidSchema } from "./common.schemas";
import { optionalText } from "./medical-entry.schemas";

const wholeDays = z.number().int("Use a whole number of days.");

const CATALOG_STEP_KINDS: readonly MedicalProtocolStepKind[] = [
  MedicalProtocolStepKind.VACCINE,
  MedicalProtocolStepKind.TEST,
  MedicalProtocolStepKind.TREATMENT,
];

const MedicalProtocolStepFormSchema = z.object({
  id: cuidSchema.nullish(),
  kind: z.enum(MedicalProtocolStepKind),
  itemId: cuidSchema.nullable(),
  examType: z.enum(ExamType).nullable(),
  // Required: a cleared number field holds null.
  offsetDays: z
    .number({ error: "Give the days after intake." })
    .int("Use a whole number of days.")
    .min(0, "Can't be before intake.")
    .max(MAX_PROTOCOL_OFFSET_DAYS, `At most ${MAX_PROTOCOL_OFFSET_DAYS} days after intake.`),
  notBeforeAgeDays: wholeDays
    .min(0, "Can't be negative.")
    .max(
      MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS,
      `At most ${MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS} days (five years).`,
    )
    .nullable(),
  repeatIntervalDays: wholeDays
    .min(1, "At least one day.")
    .max(MAX_REPEAT_INTERVAL_DAYS, `At most ${MAX_REPEAT_INTERVAL_DAYS} days (five years).`)
    .nullable(),
  repeatCount: z
    .number()
    .int("Use a whole number.")
    .min(1, "At least one repeat.")
    .max(MAX_PROTOCOL_STEP_DOSES - 1, `At most ${MAX_PROTOCOL_STEP_DOSES - 1} repeats.`)
    .nullable(),
  untilAgeDays: wholeDays.min(1, "At least one day.").nullable(),
  notes: optionalText(2000),
});

// The form's view of a protocol. The rules here mirror the protocol service,
// which stays the authority (and alone checks names, overlaps and items
// against the database), so the form can show them before submit.
export const MedicalProtocolFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .transform((s) => s.replace(/\s+/g, " "))
      .pipe(
        z
          .string()
          .min(1, "Name is required.")
          .max(MEDICAL_PROTOCOL_NAME_MAX_LENGTH, "Name is too long."),
      ),
    // A new protocol's form starts with no species picked.
    speciesId: z.string().min(1, "Pick a species.").pipe(cuidSchema),
    minAgeDays: wholeDays.min(0, "Can't be negative.").nullable(),
    maxAgeDays: wholeDays.min(1, "At least one day.").nullable(),
    steps: z
      .array(MedicalProtocolStepFormSchema)
      .min(1, "A protocol needs at least one step."),
  })
  .superRefine((protocol, ctx) => {
    if (
      protocol.minAgeDays !== null &&
      protocol.maxAgeDays !== null &&
      protocol.maxAgeDays <= protocol.minAgeDays
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maxAgeDays"],
        message: "Must be older than the youngest age.",
      });
    }
    protocol.steps.forEach((step, index) => {
      const issue = (field: string, message: string) =>
        ctx.addIssue({ code: "custom", path: ["steps", index, field], message });
      const catalog = CATALOG_STEP_KINDS.includes(step.kind);
      if (catalog && !step.itemId) issue("itemId", "Pick the item.");
      if (!catalog && step.itemId) issue("itemId", "Only a vaccine, test or treatment has an item.");
      if (step.kind === MedicalProtocolStepKind.EXAM && !step.examType) {
        issue("examType", "Pick the exam type.");
      }
      if (step.kind !== MedicalProtocolStepKind.EXAM && step.examType) {
        issue("examType", "Only an exam has an exam type.");
      }
      if (
        !catalog &&
        (step.repeatIntervalDays !== null ||
          step.repeatCount !== null ||
          step.untilAgeDays !== null)
      ) {
        issue("repeatIntervalDays", "Only a vaccine, test or treatment repeats.");
        return;
      }
      if (
        step.repeatIntervalDays !== null &&
        step.repeatCount === null &&
        step.untilAgeDays === null
      ) {
        issue("repeatCount", "Give a number of repeats, an age to stop at, or both.");
      }
      if (step.repeatCount !== null && step.repeatIntervalDays === null) {
        issue("repeatIntervalDays", "Repeats need an interval.");
      }
      if (
        step.untilAgeDays !== null &&
        step.notBeforeAgeDays !== null &&
        step.untilAgeDays <= step.notBeforeAgeDays
      ) {
        issue("untilAgeDays", "Must be after the earliest age.");
      }
    });
  });

export type MedicalProtocolFormInput = z.input<typeof MedicalProtocolFormSchema>;
export type MedicalProtocolFormValues = z.output<typeof MedicalProtocolFormSchema>;
