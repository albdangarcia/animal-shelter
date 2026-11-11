import { z } from "zod";
import { AnimalSize } from "@/prisma/generated/enums";
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
  // The form sends "" when no species is picked.
  speciesId: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Pick a species." : undefined,
    })
    .min(1, "Pick a species.")
    .pipe(cuidSchema),
  typicalSize: z.enum(AnimalSize).optional().or(z.literal("")),
});