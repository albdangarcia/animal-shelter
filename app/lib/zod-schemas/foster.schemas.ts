import { z } from "zod";
import {
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
} from "@/prisma/generated/enums";
import { cuidSchema, requiredNumber, usStateSchema } from "./common.schemas";
import { isFosterPlacementOverdue } from "@/app/lib/utils/date-utils";
import {
  householdFieldsShape,
  householdSuperRefine,
} from "./household-profile.schemas";

// Just the capability fields, reused by the foster application form, the
// staff "direct add" foster profile form, and the foster profile's
// capabilities card. Exported as a raw shape as well as a schema: the
// composite schemas below spread it rather than extending a refined object.
export const fosterCapabilityFieldsShape = {
  // Array field — required: a foster who can't take any species is not an
  // actionable roster entry.
  speciesIds: z
    .array(cuidSchema)
    .min(1, { error: "Select at least one species you can foster." }),
  maxAnimals: requiredNumber("Max animals")
    .int({ error: "Max animals must be a positive whole number." })
    .min(1, { error: "Max animals must be a positive whole number." }),
  hasQuarantineSpace: z.enum(["true", "false"]).optional(),
  canGiveOralMeds: z.enum(["true", "false"]).optional(),
  canBottleFeed: z.enum(["true", "false"]).optional(),
  canTransport: z.enum(["true", "false"]).optional(),
  acceptsMedical: z.enum(["true", "false"]).optional(),
  acceptsHospice: z.enum(["true", "false"]).optional(),
  availabilityNotes: z
    .string()
    .max(1000, {
      error: "Availability notes cannot exceed 1000 characters.",
    })
    .optional(),
};

export const FosterCapabilityFieldsSchema = z.object(
  fosterCapabilityFieldsShape,
);

export type FosterCapabilityFieldsInput = z.input<
  typeof FosterCapabilityFieldsSchema
>;
export type FosterCapabilityFieldsOutput = z.output<
  typeof FosterCapabilityFieldsSchema
>;

/**
 * Converts validated capability values into the shape Prisma writes.
 *
 * The "true"/"false" -> boolean mapping was previously written out by hand in
 * all three actions that touch these columns. undefined stays undefined so an
 * unanswered select leaves the column alone on update; availabilityNotes maps
 * "" to null because the column is nullable.
 */
export const toFosterCapabilityData = (data: FosterCapabilityFieldsOutput) => {
  const toBool = (value: "true" | "false" | undefined) =>
    value === undefined ? undefined : value === "true";

  return {
    maxAnimals: data.maxAnimals,
    hasQuarantineSpace: toBool(data.hasQuarantineSpace),
    canGiveOralMeds: toBool(data.canGiveOralMeds),
    canBottleFeed: toBool(data.canBottleFeed),
    canTransport: toBool(data.canTransport),
    acceptsMedical: toBool(data.acceptsMedical),
    acceptsHospice: toBool(data.acceptsHospice),
    availabilityNotes: data.availabilityNotes?.trim()
      ? data.availabilityNotes
      : null,
  };
};

// Applicant contact fields, same shape as the adoption application's — kept
// separate so it can be spread alongside the reused household shape without
// copying the household fields themselves.
const fosterApplicantFieldsShape = {
  applicantName: z.string().min(1, { error: "Applicant name is required." }),
  applicantEmail: z.email({ error: "Invalid email address." }),
  applicantPhone: z.string().min(1, { error: "Applicant phone is required." }),
  applicantAddressLine1: z
    .string()
    .min(1, { error: "Address Line 1 is required." }),
  applicantAddressLine2: z.string().optional(),
  applicantCity: z.string().min(1, { error: "City is required." }),
  applicantState: usStateSchema,
  applicantZipCode: z.string().regex(/^\d{5}$/, { error: "Invalid ZIP code." }),
};

// Household section reuses the shared household shape (required — prefilled
// from the person's HouseholdProfile, upserted on submit, same mechanism as
// createMyAdoptionApp) plus applicant contact fields and the foster
// capability section, with the household refinement applied once at the end.
export const FosterApplicationFormSchema = z
  .object({
    ...householdFieldsShape,
    ...fosterApplicantFieldsShape,
    ...fosterCapabilityFieldsShape,
  })
  .superRefine(householdSuperRefine);

export type FosterApplicationFormInput = z.input<
  typeof FosterApplicationFormSchema
>;

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

export type FosterApplicationStatusChangeInput = z.input<
  typeof FosterApplicationStatusChangeSchema
>;

export const CreateFosterPlacementSchema = z.object({
  animalId: cuidSchema,
  fosterProfileId: cuidSchema,
  type: z.enum(FosterPlacementType, {
    error: (issue) =>
      issue.input === undefined ? "A placement type is required." : undefined,
  }),
  // Optional by design: a foster ends on an outcome, not a date, and
  // LONG_TERM / FOSTER_TO_ADOPT placements are open-ended. When a date *is*
  // set it feeds attention-queue Signal 3, so reject a past date here — the
  // calendar only greys out past days client-side, and a placement created
  // already overdue is never intentional.
  expectedEndDate: z
    .date()
    .refine((date) => !isFosterPlacementOverdue(date), {
      error: "An expected return date cannot be in the past.",
    })
    .optional(),
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
export const CreateFosterProfileSchema = z.object({
  personId: cuidSchema,
  ...fosterCapabilityFieldsShape,
});

export type CreateFosterProfileInput = z.input<
  typeof CreateFosterProfileSchema
>;
