import { z } from "zod";
import { AnimalSize, SacSpeciesCategory } from "@/prisma/generated/enums";
import { cuidSchema } from "./common.schemas";

export const SpeciesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Name is required.").max(50, "Name is too long.")),
  // The Shelter Animals Count species it is counted under. The form sends ""
  // for "Not reported", which saves as null. Left out, a new species is not
  // reported and an edited one keeps the category it has.
  sacCategory: z.enum(SacSpeciesCategory).optional().or(z.literal("")),
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