import { z } from "zod";
import {
  householdFieldsShape,
  householdSuperRefine,
} from "./household-profile.schemas";
import { usStateSchema } from "./common.schemas";

// Applicant contact fields plus the adoption-specific intent field. Exported
// as a raw shape so StaffAdoptionApplicationFormSchema can compose it rather
// than extending an already-refined schema.
export const adoptionApplicantFieldsShape = {
  applicantName: z.string().min(1, { error: "Applicant name is required" }),
  applicantEmail: z.email({ error: "Invalid email address" }),
  applicantPhone: z.string().min(1, { error: "Applicant phone is required" }),
  applicantAddressLine1: z
    .string()
    .min(1, { error: "Address Line 1 is required" }),
  applicantAddressLine2: z.string().optional(),
  applicantCity: z.string().min(1, { error: "City is required" }),
  applicantState: usStateSchema,
  applicantZipCode: z.string().regex(/^\d{5}$/, { error: "Invalid ZIP code" }),
  reasonForAdoption: z
    .string()
    .min(1, { error: "Reason for adoption is required" }),
};

// The full public adoption application shape. Household fields (and the
// childrenAges / landlordPermission cross-checks) come from the shared
// household shape so account settings, adoption, and foster all validate them
// identically.
export const myAdoptionAppFieldsShape = {
  ...householdFieldsShape,
  ...adoptionApplicantFieldsShape,
};

export const MyAdoptionAppFormSchema = z
  .object(myAdoptionAppFieldsShape)
  .superRefine(householdSuperRefine);

export type MyAdoptionAppFormInput = z.input<typeof MyAdoptionAppFormSchema>;
export type MyAdoptionAppFormOutput = z.output<typeof MyAdoptionAppFormSchema>;

/**
 * Converts validated applicant fields into the shape Prisma writes.
 *
 * Pairs with toHouseholdData(): between them they cover every column an
 * AdoptionApplication row carries. Lives here rather than inline in the
 * actions because three actions across two files (createMyAdoptionApp,
 * staffCreateAdoptionApplication, staffEditPersonApplication) wrote the same
 * empty-string-to-null mapping by hand.
 */
export const toAdoptionApplicantData = (data: MyAdoptionAppFormOutput) => ({
  applicantName: data.applicantName,
  applicantEmail: data.applicantEmail,
  applicantPhone: data.applicantPhone,
  applicantAddressLine1: data.applicantAddressLine1,
  applicantAddressLine2: data.applicantAddressLine2 || null,
  applicantCity: data.applicantCity,
  applicantState: data.applicantState,
  applicantZipCode: data.applicantZipCode,
  reasonForAdoption: data.reasonForAdoption,
});
