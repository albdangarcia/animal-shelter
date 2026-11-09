import { z } from "zod";
import { optionalText, requiredDay } from "./medical-entry.schemas";
import { cuidSchema } from "./common.schemas";
import { VET_VISIT_SUMMARY_MAX_LENGTH } from "../constants/medical";

export const VetVisitReportSchema = z.object({
  visitDate: requiredDay("The visit date"),
  vetPartnerId: cuidSchema.nullish(),
  vetName: optionalText(120),
  summary: z.string().trim().min(1, "Say what happened at the visit.").max(VET_VISIT_SUMMARY_MAX_LENGTH),
}).superRefine((values, ctx) => {
  if ((!values.vetPartnerId && !values.vetName) || (values.vetPartnerId && values.vetName)) ctx.addIssue({ code: "custom", path: ["vetName"], message: "Pick a clinic or give the vet's name." });
});
export type VetVisitReportFormInput = z.input<typeof VetVisitReportSchema>;
