import { z } from "zod";
import { LocationType } from "@/prisma/generated/enums";
import { cuidSchema, requiredNumber } from "./common.schemas";

export const LocationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Name is required.").max(50, "Name is too long.")),
  type: z.enum(LocationType, {
    error: (issue) =>
      issue.input === undefined ? "Please select a location type." : undefined,
  }),
});

export const UnitFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Name is required.").max(50, "Name is too long.")),
  // Was z.coerce.number() — coercion existed to parse the string FormData
  // produced; the client now sends a real number (the input's onChange
  // parses it), and Zod 4 types a coerced field's INPUT as `unknown`, which
  // breaks using z.input as the react-hook-form values type.
  capacity: requiredNumber("Capacity").int({ error: "Capacity must be a whole number." }).min(1, { error: "Capacity must be at least 1." }),
  locationId: cuidSchema,
});
