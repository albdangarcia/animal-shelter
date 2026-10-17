import { z } from "zod";
import { MedicalDocumentType } from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_NAME_MAX_LENGTH } from "@/app/lib/constants/medical";
import { cuidSchema } from "./common.schemas";
import {
  optionalDay,
  optionalId,
  optionalText,
  requiredReason,
} from "./medical-entry.schemas";

// The document form's view of a medical document. The upload sends these
// fields beside the file, which the route checks by its bytes; a correction
// sends every field, filled from what's stored. The rules that need nothing
// but the form's own values are mirrored from the document service so the
// form can show them before submit; the service stays the authority, and
// checks what needs the animal, its entries or today.

const name = z
  .string({ error: "Give the document a name." })
  .trim()
  .min(1, { error: "Give the document a name." })
  .max(MEDICAL_DOCUMENT_NAME_MAX_LENGTH, {
    error: `The name can't be longer than ${MEDICAL_DOCUMENT_NAME_MAX_LENGTH} characters.`,
  });

const documentFields = {
  name,
  type: z.enum(MedicalDocumentType, { error: "Pick the document type." }),
  documentDate: optionalDay("The document date"),
  notes: optionalText(2000),
  entryId: optionalId,
};

/**
 * The fields an upload sends beside its file. `vetReportId` names the
 * foster's report the paperwork belongs to, when a foster sends it.
 */
export const MedicalDocumentUploadSchema = z.object({
  animalId: cuidSchema,
  ...documentFields,
  vetReportId: optionalId,
});

export type MedicalDocumentUploadInput = z.input<typeof MedicalDocumentUploadSchema>;
export type MedicalDocumentUploadValues = z.output<typeof MedicalDocumentUploadSchema>;

/** A correction: what an upload set, apart from the file and the report. */
export const MedicalDocumentCorrectionSchema = z.object(documentFields);

export type MedicalDocumentCorrectionInput = z.input<typeof MedicalDocumentCorrectionSchema>;
export type MedicalDocumentCorrectionValues = z.output<typeof MedicalDocumentCorrectionSchema>;

export const VoidMedicalDocumentSchema = z.object({
  reason: requiredReason("A reason for voiding this document is required."),
});

export type VoidMedicalDocumentInput = z.input<typeof VoidMedicalDocumentSchema>;

export const RemoveMedicalDocumentFileSchema = z.object({
  reason: requiredReason("A reason for removing this file is required."),
});

export type RemoveMedicalDocumentFileInput = z.input<typeof RemoveMedicalDocumentFileSchema>;

/**
 * The Documents page's type filter, from the URL: the types picked, as the
 * shared filter writes them (one comma-separated value, or the parameter
 * repeated). An unknown type is ignored rather than refused; none means every
 * type.
 */
export const medicalDocumentTypesParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => [
    ...new Set(
      [value ?? []]
        .flat()
        .flatMap((part) => part.split(","))
        .filter((type): type is MedicalDocumentType =>
          Object.values(MedicalDocumentType).includes(type as MedicalDocumentType),
        ),
    ),
  ]);
