import { z } from "zod";
import { OutcomeType } from "@/prisma/generated/enums";
import { calendarDaySchema } from "./common.schemas";

export const OutcomeFormSchema = z
  .object({
    outcomeDate: calendarDaySchema("An outcome date"),
    outcomeType: z.enum(OutcomeType, {
      error: (issue) =>
        issue.input === undefined ? "An outcome type is required." : undefined,
    }),
    destinationPartnerId: z.string().optional(),
    ownerId: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      // If the outcome type is TRANSFER_OUT, a partner must be selected.
      if (data.outcomeType === "TRANSFER_OUT") {
        return !!data.destinationPartnerId;
      }
      return true;
    },
    {
      path: ["destinationPartnerId"], // Field that will display the error
      error: "A destination partner is required for transfers.",
    }
  )
  .refine(
    (data) => {
      // If the outcome type is RETURN_TO_OWNER, an owner must be selected.
      if (data.outcomeType === "RETURN_TO_OWNER") {
        return !!data.ownerId;
      }
      return true;
    },
    {
      path: ["ownerId"], // Field that will display the error
      error: "An owner is required for return-to-owner outcomes.",
    }
  );

export type OutcomeFormInput = z.input<typeof OutcomeFormSchema>;