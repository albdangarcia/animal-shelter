import { z } from "zod";
import { LivingSituation } from "@prisma/client";

export const HouseholdProfileFormSchema = z.object({
  livingSituation: z.enum(LivingSituation, {
    error: (issue) =>
      issue.input === undefined ? "Living situation is required." : undefined,
  }),
  hasYard: z.enum(["true", "false"]).optional(),
  landlordPermission: z.enum(["true", "false"]).optional(),
  householdSize: z
    .string()
    .min(1, { error: "Household size is required." })
    .regex(/^\d+$/, { error: "Household size must be a positive number." }),
  hasChildren: z.enum(["true", "false"]).optional(),
  childrenAges: z
    .string()
    .optional()
    .refine((val) => !val || /^[\d\s,]*$/.test(val), {
      error: "Ages must be a comma-separated list of numbers.",
    }),
  otherAnimalsDescription: z.string().optional(),
  animalExperience: z.string().optional(),
});