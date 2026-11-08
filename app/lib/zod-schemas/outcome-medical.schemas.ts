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
import { optionalText } from "./medical-entry.schemas";

const text = (label: string) => z.string({ error: `${label} is required.` })
  .trim()
  .min(1, `${label} is required.`)
  .max(OUTCOME_MEDICAL_TEXT_MAX_LENGTH, `Must be ${OUTCOME_MEDICAL_TEXT_MAX_LENGTH} characters or fewer.`);

// A picker holds "" until something is chosen, which is not a CUID, so the
// readable message covers both a missing and a malformed id.
const referenceId = (message: string) => z.string({ error: message }).trim()
  .pipe(z.cuid2({ error: message }));
const optionalReferenceId = (message: string) => z.string().trim().nullish()
  .transform((value) => value || null)
  .pipe(referenceId(message).nullable());

/** Complete clinical payloads. Optional blanks clear values, including on correction. */
export const EuthanasiaMedicalSchema = z.strictObject({
  kind: z.literal("EUTHANASIA"),
  source: z.enum([MedicalEntrySource.IN_HOUSE, MedicalEntrySource.OUTSIDE_VET], { error: "Pick where the procedure was done." }),
  vetPartnerId: optionalReferenceId("Pick a clinic from the list."),
  vetName: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  reasonCategory: z.enum(EuthanasiaReasonCategory, { error: "Pick a reason category." }),
  reasonNotes: optionalText(MEDICAL_REASON_MAX_LENGTH),
  authorizedById: referenceId("Pick who authorized it."),
  performedById: optionalReferenceId("Pick a valid performer."),
  performedByName: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  drug: text("The drug"),
  dose: text("The dose with its unit"),
  route: text("The route"),
  witness: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
  bodyDisposition: optionalText(OUTCOME_MEDICAL_TEXT_MAX_LENGTH),
}).superRefine((value, ctx) => {
  if (value.reasonCategory === "OTHER" && !value.reasonNotes) {
    ctx.addIssue({ code: "custom", path: ["reasonNotes"], message: "Describe the reason." });
  }
  if (!!value.performedById === !!value.performedByName) {
    // Neither and both are different mistakes, so each says which it is.
    // Either control can be active, so each alternative must carry the error.
    const message = value.performedById
      ? "Pick a performer or give the outside vet's name, not both."
      : value.source === "IN_HOUSE"
        ? "Pick who performed the procedure."
        : "Pick a performer or give the outside vet's name.";
    for (const field of ["performedById", "performedByName"] as const) {
      ctx.addIssue({ code: "custom", path: [field], message });
    }
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
  circumstances: z.enum(DeathCircumstances, { error: "Pick the circumstances." }),
  circumstanceNotes: optionalText(MEDICAL_REASON_MAX_LENGTH),
  causeKnowledge: z.enum(["KNOWN", "UNKNOWN"], { error: "Say whether the cause is known." }),
  cause: optionalText(MEDICAL_REASON_MAX_LENGTH),
  necropsyRequested: z.boolean({ error: "Say whether a necropsy was requested." }).nullable(),
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
