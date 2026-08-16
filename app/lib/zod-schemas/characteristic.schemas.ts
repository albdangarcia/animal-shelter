import { z } from "zod";
import { CharacteristicCategory } from "@/prisma/generated/enums";

export const CharacteristicFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " ")) // collapse internal whitespace
    .pipe(z.string().min(1, "Name is required.").max(100, "Name is too long.")),
  category: z.enum(CharacteristicCategory),
});