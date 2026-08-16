import { z } from "zod";
import { LivingSituation } from "@/prisma/generated/enums";

// The single definition of "what a complete household record looks like."
// Optional to have (no row until someone submits), but complete if it
// exists — every consumer (account settings, adoption, foster) validates
// against this same required shape so prefill data is always trustworthy.
export const HouseholdFieldsSchema = z
  .object({
    livingSituation: z.enum(LivingSituation, {
      error: (issue) =>
        issue.input === undefined ? "Living situation is required." : undefined,
    }),

    // Validates a "true" or "false" string, but does NOT transform it to a boolean
    hasYard: z.enum(["true", "false"], {
      error: (issue) =>
        issue.input === undefined ? "Yard information is required." : undefined,
    }),
    landlordPermission: z.enum(["true", "false"], {
      error: (issue) =>
        issue.input === undefined
          ? "Landlord permission information is required."
          : undefined,
    }),

    // Validates a string that contains a number, but does NOT transform it
    householdSize: z
      .string()
      .min(1, { error: "Household size is required." })
      .regex(/^\d+$/, { error: "Household size must be a positive number." }),

    hasChildren: z.enum(["true", "false"], {
      error: (issue) =>
        issue.input === undefined
          ? "Children information is required."
          : undefined,
    }),

    // Validates the string of ages, but does NOT transform it to a number array
    childrenAges: z.string().regex(/^[\d\s,]*$/, {
      error: "Ages must be a comma-separated list of numbers.",
    }),

    otherAnimalsDescription: z.string().optional(),
    animalExperience: z
      .string()
      .min(1, { error: "Animal experience is required" }),
  })
  .superRefine((data, ctx) => {
    if (data.hasChildren === "false" && data.childrenAges.trim().length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["childrenAges"],
        message: "If 'No children' is selected, ages should not be provided.",
      });
    }
    if (data.hasChildren === "true" && data.childrenAges.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["childrenAges"],
        message: "Please provide the ages of the children if 'Yes' is selected.",
      });
    }
  });
