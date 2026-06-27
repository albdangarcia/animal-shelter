import { z } from "zod";
import { ApplicationStatus, LivingSituation } from "@prisma/client";

// Exclude 'ADOPTED' from this list.
const updatableApplicationStatuses = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

export const StaffUpdateAdoptionAppFormSchema = z
  .object({
    status: z
      .enum(updatableApplicationStatuses, {
        error: "Invalid application status.",
      })
      .optional(),
    internalNotes: z.string().optional(),
    statusChangeReason: z.string().optional(),
  });

export const StaffAdoptionApplicationFormSchema = z.object({
  applicantName: z.string().min(1, { error: "Name is required." }),
  applicantEmail: z.email({ error: "Invalid email address." }),
  applicantPhone: z.string().min(1, { error: "Phone is required." }),
  applicantAddressLine1: z
    .string()
    .min(1, { error: "Street address is required." }),
  applicantAddressLine2: z.string().optional(),
  applicantCity: z.string().min(1, { error: "City is required." }),
  applicantState: z.string().min(1, { error: "State is required." }),
  applicantZipCode: z
    .string()
    .regex(/^\d{5}$/, { error: "ZIP code must be 5 digits." }),
  livingSituation: z.enum(LivingSituation, {
    error: (issue) =>
      issue.input === undefined ? "Living situation is required." : undefined,
  }),
  householdSize: z
    .string()
    .min(1, { error: "Household size is required." })
    .regex(/^\d+$/, { error: "Household size must be a positive number." }),
  hasYard: z.enum(["true", "false"]).optional(),
  landlordPermission: z.enum(["true", "false"]).optional(),
  hasChildren: z.enum(["true", "false"]).optional(),
  childrenAges: z
    .string()
    .optional()
    .refine((val) => !val || /^[\d\s,]*$/.test(val), {
      error: "Ages must be a comma-separated list of numbers.",
    }),
  otherAnimalsDescription: z.string().optional(),
  animalExperience: z.string().optional(),
  reasonForAdoption: z
    .string()
    .min(1, { error: "Reason for adoption is required." }),
  animalId: z.string().optional(),
});