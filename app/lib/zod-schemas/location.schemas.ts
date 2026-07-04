import { z } from "zod";
import { LocationType } from "@prisma/client";
import { cuidSchema } from "./common.schemas";

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
  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number.")
    .min(1, "Capacity must be at least 1."),
  locationId: cuidSchema,
});
