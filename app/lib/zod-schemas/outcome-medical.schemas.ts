import { z } from "zod";
import {
  DeathCircumstances,
  EuthanasiaReasonCategory,
  MedicalEntrySource,
  OutcomeType,
} from "@/prisma/generated/enums";
import {
  MEDICAL_REASON_MAX_LENGTH,
  OUTCOME_MEDICAL_TEXT_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import { cuidSchema } from "./common.schemas";
import { optionalText } from "./medical-entry.schemas";

const text = (label: string) => z.string({ error: `${label} is required.` })
  .trim()
  .min(1, `${label} is required.`)
  .max(OUTCOME_MEDICAL_TEXT_MAX_LENGTH, `Must be ${OUTCOME_MEDICAL_TEXT_MAX_LENGTH} characters or fewer.`);

const referenceId = z.string().trim().pipe(cuidSchema);
const optionalReferenceId = z.string().trim().nullish()
  .transform((value) => value || null)
  .pipe(referenceId.nullable());

/** Complete clinical payloads. Optional blanks clear values, including on correction. */
export const EuthanasiaMedicalSchema = z.strictObject({
  kind: z.literal("EUTHANASIA"),
  source: z.enum([MedicalEntrySource.IN_HOUSE, MedicalEntrySource.OUTSIDE_VET]),
  vetPartnerId: optionalReferenceId,
  vetName: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  reasonCategory: z.enum(EuthanasiaReasonCategory),
  reasonNotes: optionalText(MEDICAL_REASON_MAX_LENGTH),
  authorizedById: referenceId,
  performedById: optionalReferenceId,
  performedByName: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  drug: text("The drug"),
  dose: text("The dose, including its unit"),
  route: text("The route"),
  witness: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  bodyDisposition: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
}).superRefine((value, ctx) => {
  if (value.reasonCategory === "OTHER" && !value.reasonNotes) {
    ctx.addIssue({ code: "custom", path: ["reasonNotes"], message: "Describe the reason." });
  }
  if (!!value.performedById === !!value.performedByName) {
    ctx.addIssue({ code: "custom", path: ["performedById"], message: "Pick a performer or give the outside vet's name, rather than both." });
  }
  if (value.source === "IN_HOUSE") {
    if (value.performedByName) {
      ctx.addIssue({ code: "custom", path: ["performedByName"], message: "Pick the person who performed the procedure in house." });
    }
    if (value.vetPartnerId) {
      ctx.addIssue({ code: "custom", path: ["vetPartnerId"], message: "A vet clinic is only for care given outside the shelter." });
    }
    if (value.vetName) {
      ctx.addIssue({ code: "custom", path: ["vetName"], message: "A vet's name is only for care given outside the shelter." });
    }
  }
});

export const DeathMedicalSchema = z.strictObject({
  kind: z.literal("DEATH"),
  source: z.null().optional().transform(() => null),
  circumstances: z.enum(DeathCircumstances),
  circumstanceNotes: optionalText(MEDICAL_REASON_MAX_LENGTH),
  causeKnowledge: z.enum(["KNOWN", "UNKNOWN"]),
  cause: optionalText(MEDICAL_REASON_MAX_LENGTH),
  necropsyRequested: z.boolean().nullable(),
  bodyDisposition: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
}).superRefine((value, ctx) => {
  if (value.circumstances === "OTHER" && !value.circumstanceNotes) {
    ctx.addIssue({ code: "custom", path: ["circumstanceNotes"], message: "Describe the circumstances." });
  }
  if (value.causeKnowledge === "KNOWN" && !value.cause) {
    ctx.addIssue({ code: "custom", path: ["cause"], message: "Give the known cause, or choose Unknown." });
  }
}).transform((value) => ({ ...value, cause: value.causeKnowledge === "UNKNOWN" ? null : value.cause }));

export const OutcomeMedicalDetailsSchema = z.discriminatedUnion("kind", [
  EuthanasiaMedicalSchema,
  DeathMedicalSchema,
]);

const ordinaryOutcome = z.enum([
  OutcomeType.ADOPTION,
  OutcomeType.TRANSFER_OUT,
  OutcomeType.RETURN_TO_OWNER,
  OutcomeType.OTHER,
]);

/** New outcomes always require their clinical facts; no client legacy flag. */
export const OutcomeMedicalCreateSchema = z.discriminatedUnion("outcomeType", [
  z.object({ outcomeType: z.literal(OutcomeType.EUTHANIZED), medical: EuthanasiaMedicalSchema }),
  z.object({ outcomeType: z.literal(OutcomeType.DECEASED), medical: DeathMedicalSchema }),
  z.object({ outcomeType: ordinaryOutcome, medical: z.never().optional() }),
]);

/** Omitted medical payload means keep. Supplied payload is complete, never null. */
export const OutcomeMedicalCorrectionSchema = z.discriminatedUnion("outcomeType", [
  z.object({ outcomeType: z.literal(OutcomeType.EUTHANIZED), medical: EuthanasiaMedicalSchema.optional() }),
  z.object({ outcomeType: z.literal(OutcomeType.DECEASED), medical: DeathMedicalSchema.optional() }),
  z.object({ outcomeType: ordinaryOutcome, medical: z.never().optional() }),
]);

export type OutcomeMedicalDetailsInput = z.input<typeof OutcomeMedicalDetailsSchema>;
export type OutcomeMedicalDetails = z.output<typeof OutcomeMedicalDetailsSchema>;
export type OutcomeMedicalCreateInput = z.input<typeof OutcomeMedicalCreateSchema>;
export type OutcomeMedicalCreateValues = z.output<typeof OutcomeMedicalCreateSchema>;
export type OutcomeMedicalCorrectionInput = z.input<typeof OutcomeMedicalCorrectionSchema>;
export type OutcomeMedicalCorrectionValues = z.output<typeof OutcomeMedicalCorrectionSchema>;
