import { z } from "zod";
import { MedicalEntryKind, MicrochipRegistrationStatus } from "@/prisma/generated/enums";
import { optionalDay, optionalText } from "./medical-field.schemas";
import { microchipRegistrationIssue } from "@/app/lib/utils/microchip-registration";

// Bounded facts shared by form parsing and the locked entry writers.
export const VETERINARIAN_NAME_MAX_LENGTH = 200;
export const VETERINARIAN_LICENSE_MAX_LENGTH = 100;
export const REGISTRY_NAME_MAX_LENGTH = 100;
export const REGISTRATION_NOTES_MAX_LENGTH = 2000;

export const VaccineCredentialsSchema = z.strictObject({
  veterinarianName: optionalText(VETERINARIAN_NAME_MAX_LENGTH),
  veterinarianLicenseNumber: optionalText(VETERINARIAN_LICENSE_MAX_LENGTH),
});

export const MicrochipRegistrationSchema = z.strictObject({
  registrationStatus: z.enum(MicrochipRegistrationStatus),
  registryName: optionalText(REGISTRY_NAME_MAX_LENGTH),
  registrationDate: optionalDay("The registration date"),
  registrationNotes: optionalText(REGISTRATION_NOTES_MAX_LENGTH),
}).superRefine((value, ctx) => {
  const issue = microchipRegistrationIssue(value);
  if (issue) ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
});

/** A separate optional group allows old callers to omit facts altogether. */
export const MedicalEntryOutputFactsSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(MedicalEntryKind.VACCINE), credentials: VaccineCredentialsSchema.optional() }),
  z.strictObject({ kind: z.literal(MedicalEntryKind.MICROCHIP), registration: MicrochipRegistrationSchema.optional() }),
  z.strictObject({ kind: z.enum([
    MedicalEntryKind.TEST, MedicalEntryKind.TREATMENT, MedicalEntryKind.SURGERY,
    MedicalEntryKind.EXAM, MedicalEntryKind.EUTHANASIA, MedicalEntryKind.DEATH,
  ]) }),
]);
