import { z } from "zod";
import {
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
} from "@/prisma/generated/enums";
import { cuidSchema, usStateSchema } from "./common.schemas";
import { HouseholdFieldsSchema } from "./household-profile.schemas";

// Just the capability fields, reused by the foster application form and the
// staff "direct add" foster profile form.
export const FosterCapabilityFieldsSchema = z.object({
  // Array field — pulled with getAll in the action, same convention as
  // additionalColors on the animal form. Required: a foster who can't take
  // any species is not an actionable roster entry.
  speciesIds: z
    .array(cuidSchema)
    .min(1, { error: "Select at least one species you can foster." }),
  maxAnimals: z
    .string()
    .min(1, { error: "Max animals is required." })
    .regex(/^[1-9]\d*$/, {
      error: "Max animals must be a positive whole number.",
    }),
  hasQuarantineSpace: z.enum(["true", "false"]).optional(),
  canGiveOralMeds: z.enum(["true", "false"]).optional(),
  canBottleFeed: z.enum(["true", "false"]).optional(),
  canTransport: z.enum(["true", "false"]).optional(),
  acceptsMedical: z.enum(["true", "false"]).optional(),
  acceptsHospice: z.enum(["true", "false"]).optional(),
  availabilityNotes: z.string().max(1000, {
    error: "Availability notes cannot exceed 1000 characters.",
  }).optional(),
});

// Applicant contact fields, same shape as MyAdoptionAppFormSchema's — kept
// separate so it can be merged onto the reused household schema without
// copying the household fields themselves.
const FosterApplicantFieldsSchema = z.object({
  applicantName: z.string().min(1, { error: "Applicant name is required." }),
  applicantEmail: z.email({ error: "Invalid email address." }),
  applicantPhone: z.string().min(1, { error: "Applicant phone is required." }),
  applicantAddressLine1: z
    .string()
    .min(1, { error: "Address Line 1 is required." }),
  applicantAddressLine2: z.string().optional(),
  applicantCity: z.string().min(1, { error: "City is required." }),
  applicantState: usStateSchema,
  applicantZipCode: z
    .string()
    .regex(/^\d{5}$/, { error: "Invalid ZIP code." }),
});

// Household section reuses the shared HouseholdFieldsSchema (required —
// prefilled from the person's HouseholdProfile, upserted on submit, same
// mechanism as createMyAdoptionApp) plus applicant contact fields and the
// foster capability section.
export const FosterApplicationFormSchema = HouseholdFieldsSchema.extend(
  FosterApplicantFieldsSchema.shape,
).extend(FosterCapabilityFieldsSchema.shape);

// Reuses the existing ApplicationStatus enum; ADOPTED is never used for
// foster applications.
const updatableFosterApplicationStatuses = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

export const FosterApplicationStatusChangeSchema = z.object({
  applicationId: cuidSchema,
  status: z.enum(updatableFosterApplicationStatuses, {
    error: "Invalid application status.",
  }),
  statusChangeReason: z.string().min(1, {
    error: "A reason for the status change is required.",
  }),
});

export const CreateFosterPlacementSchema = z.object({
  animalId: cuidSchema,
  fosterProfileId: cuidSchema,
  type: z.enum(FosterPlacementType, {
    error: (issue) =>
      issue.input === undefined ? "A placement type is required." : undefined,
  }),
  expectedEndDate: z.date().optional(),
  notes: z.string().optional(),
});

export const ReturnFromFosterSchema = z.object({
  placementId: cuidSchema,
  returnReason: z.enum(FosterReturnReason, {
    error: (issue) =>
      issue.input === undefined ? "A return reason is required." : undefined,
  }),
  returnNotes: z.string().optional(),
  unitId: cuidSchema,
});

export const ConvertFosterToAdoptionSchema = z.object({
  placementId: cuidSchema,
  adoptionApplicationId: cuidSchema.optional(),
});

// Staff "direct add" pressure valve — person picker + capability form, born
// ACTIVE.
export const CreateFosterProfileSchema = z
  .object({
    personId: cuidSchema,
  })
  .extend(FosterCapabilityFieldsSchema.shape);
