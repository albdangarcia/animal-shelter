import { z } from "zod";
import { optionalText, requiredDay } from "./medical-entry.schemas";

export const FosterTreatmentSchema = z.object({
  completedDate: requiredDay("The date given"),
  notes: optionalText(2000),
});

export type FosterTreatmentInput = z.input<typeof FosterTreatmentSchema>;
