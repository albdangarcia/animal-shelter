import { z } from "zod";
import {
  MedicalConditionStatus,
  MedicalConditionType,
} from "@/prisma/generated/enums";
import { MEDICAL_CONDITION_NAME_MAX_LENGTH } from "@/app/lib/constants/medical";
import {
  optionalDay,
  optionalId,
  optionalText,
  requiredReason,
} from "./medical-entry.schemas";

// The problem-list form's view of a condition or an allergy, for adding one
// and correcting one alike: the form always sends every field. The rules
// that need nothing but the form's own values are mirrored from the
// condition service so the form can show them before submit; the service
// stays the authority, and checks what needs the animal, its record or
// today.

const name = z
  .string({ error: "The name is required." })
  .trim()
  .min(1, { error: "The name is required." })
  .max(MEDICAL_CONDITION_NAME_MAX_LENGTH, {
    error: `The name can't be longer than ${MEDICAL_CONDITION_NAME_MAX_LENGTH} characters.`,
  });

export const MedicalConditionFormSchema = z
  .object({
    type: z.enum(MedicalConditionType, { error: "Pick condition or allergy." }),
    name,
    status: z.enum(MedicalConditionStatus, { error: "Pick the status." }),
    onsetDate: optionalDay("The onset date"),
    resolvedDate: optionalDay("The resolved date"),
    diagnosedBy: optionalText(200),
    sourceEntryId: optionalId,
    characteristicId: optionalId,
    notes: optionalText(2000),
  })
  .superRefine(({ status, onsetDate, resolvedDate }, ctx) => {
    const refuse = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["resolvedDate"], message });
    if (status === MedicalConditionStatus.RESOLVED && !resolvedDate) {
      refuse("Give the day it resolved.");
    } else if (status !== MedicalConditionStatus.RESOLVED && resolvedDate) {
      refuse("Only a resolved condition has a resolved date.");
    } else if (onsetDate && resolvedDate && resolvedDate < onsetDate) {
      refuse("The resolved date can't be before the onset date.");
    }
  });

export type MedicalConditionFormInput = z.input<typeof MedicalConditionFormSchema>;
export type MedicalConditionFormValues = z.output<typeof MedicalConditionFormSchema>;

export const VoidMedicalConditionSchema = z.object({
  reason: requiredReason("A reason for voiding this condition is required."),
});

export type VoidMedicalConditionInput = z.input<typeof VoidMedicalConditionSchema>;
