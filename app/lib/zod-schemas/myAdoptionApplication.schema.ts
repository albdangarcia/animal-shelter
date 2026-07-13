import { z } from "zod";
import { HouseholdFieldsSchema } from "./household-profile.schemas";
import { usStateSchema } from "./common.schemas";

// Define the Zod schema for the adoption application form. Household fields
// (and the childrenAges superRefine cross-check) come from the shared base
// so account settings, adoption, and foster all validate them identically.
export const MyAdoptionAppFormSchema = HouseholdFieldsSchema.extend({
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
});
