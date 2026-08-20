import { z } from "zod";
import { LivingSituation } from "@/prisma/generated/enums";
import { requiredNumber } from "./common.schemas";

// Living situations where a landlord's permission is a meaningful question.
export const RENTING_SITUATIONS = [
  LivingSituation.RENT_APARTMENT,
  LivingSituation.RENT_HOUSE,
] as const;

export const isRenting = (value: LivingSituation | string | undefined) =>
  RENTING_SITUATIONS.includes(value as (typeof RENTING_SITUATIONS)[number]);

// The single definition of "what a complete household record looks like."
// Optional to have (no row until someone submits), but complete if it
// exists — every consumer (account settings, adoption, foster) validates
// against this same required shape so prefill data is always trustworthy.
//
// NOTE ON TRANSFORMS: this shape deliberately validates strings without
// converting them, so the same field definitions can be spread into the
// adoption and foster schemas. String -> DB conversion lives in
// toHouseholdData() below.
//
// Exported as a raw shape rather than only as a finished schema: the derived
// schemas compose these fields into a fresh z.object() and re-apply
// householdSuperRefine, instead of calling .extend() on an already-refined
// schema. .extend() on a refined object does still work on zod@4.4.3 (the
// refinement survives, verified against all three derived schemas), but it is
// the pattern current Zod docs steer away from, and a silent drop would mean
// childrenAges stops being validated with no error anywhere.
export const householdFieldsShape = {
  livingSituation: z.enum(LivingSituation, {
    error: (issue) =>
      issue.input === undefined ? "Living situation is required." : undefined,
  }),

  // Validates a "true" or "false" string, but does NOT transform it to a boolean
  hasYard: z.enum(["true", "false"], {
    error: (issue) =>
      issue.input === undefined ? "Yard information is required." : undefined,
  }),

  // Optional at the field level, then required by the superRefine below only
  // when the applicant is renting. Asking a homeowner whether their landlord
  // approves produces meaningless data; toHouseholdData() stores null for
  // them. Loosening this cannot break the foster/adoption forms that reuse
  // this shape — they always submit a value, so the conditional rule never
  // fires for them.
  landlordPermission: z.enum(["true", "false"]).optional(),

  // A real number: every consumer of this shape now sends the
  // NumberInput's numeric value rather than a validated numeric string.
  householdSize: requiredNumber("Household size")
    .int({ error: "Household size must be a whole number." })
    .min(1, { error: "Household size must be between 1 and 50." })
    .max(50, { error: "Household size must be between 1 and 50." }),

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
};

// The cross-field rules that belong with the shape above. Typed against only
// the fields it reads, so it can be handed to any z.object() that spreads
// householdFieldsShape — the adoption and foster schemas each apply it once.
type HouseholdRefineInput = {
  livingSituation: LivingSituation;
  landlordPermission?: "true" | "false";
  hasChildren: "true" | "false";
  childrenAges: string;
};

export const householdSuperRefine = (
  data: HouseholdRefineInput,
  ctx: z.RefinementCtx,
) => {
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
  if (isRenting(data.livingSituation) && data.landlordPermission === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["landlordPermission"],
      message: "Landlord permission is required when renting.",
    });
  }
};

export const HouseholdFieldsSchema = z
  .object(householdFieldsShape)
  .superRefine(householdSuperRefine);

export type HouseholdFieldsInput = z.input<typeof HouseholdFieldsSchema>;
export type HouseholdFieldsOutput = z.output<typeof HouseholdFieldsSchema>;

/**
 * Converts validated household form values into the shape Prisma writes.
 *
 * This is the ONLY place the string -> boolean/array conversion should
 * happen. It previously lived inline in both household actions (and in the
 * adoption and foster actions), duplicated verbatim, including a bare
 * parseInt on comma-split input that produced NaN on malformed data.
 *
 * Takes the schema's OUTPUT, so it can only be called on values that have
 * already been validated — the parseInt calls below are safe because the
 * regexes upstream have already guaranteed the format.
 */
export const toHouseholdData = (data: HouseholdFieldsOutput) => ({
  livingSituation: data.livingSituation,
  hasYard: data.hasYard === "true",
  // Null rather than false for non-renters: "not applicable", not "denied".
  landlordPermission: isRenting(data.livingSituation)
    ? data.landlordPermission === "true"
    : null,
  householdSize: data.householdSize,
  hasChildren: data.hasChildren === "true",
  childrenAges:
    data.childrenAges.trim() === ""
      ? []
      : data.childrenAges
          .split(",")
          .map((age) => age.trim())
          .filter((age) => age.length > 0)
          .map((age) => parseInt(age, 10)),
  otherAnimalsDescription: data.otherAnimalsDescription || null,
  animalExperience: data.animalExperience,
});
