import { z } from "zod";
import { optionalText, requiredDay } from "./medical-entry.schemas";
import { cuidSchema } from "./common.schemas";
import { OUTSIDE_VET_NEEDS_VET, VET_VISIT_ONE_VET, VET_VISIT_SUMMARY_MAX_LENGTH } from "../constants/medical";

export const VetVisitReportSchema = z.object({
  visitDate: requiredDay("The visit date"),
  vetPartnerId: cuidSchema.nullish(),
  vetName: optionalText(120),
  summary: z.string().trim().min(1, "Say what happened at the visit.").max(VET_VISIT_SUMMARY_MAX_LENGTH),
}).superRefine((values, ctx) => {
  // Neither and both are different mistakes, so each says which it is.
  if (!values.vetPartnerId && !values.vetName) ctx.addIssue({ code: "custom", path: ["vetName"], message: OUTSIDE_VET_NEEDS_VET });
  if (values.vetPartnerId && values.vetName) ctx.addIssue({ code: "custom", path: ["vetName"], message: VET_VISIT_ONE_VET });
});
export type VetVisitReportFormInput = z.input<typeof VetVisitReportSchema>;
