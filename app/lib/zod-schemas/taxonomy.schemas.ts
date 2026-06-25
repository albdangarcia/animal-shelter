import { z } from "zod";
import { cuidSchema } from "./common.schemas";

export const SpeciesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Name is required.").max(50, "Name is too long.")),
});

export const BreedFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Name is required.").max(50, "Name is too long.")),
  speciesId: cuidSchema,
});