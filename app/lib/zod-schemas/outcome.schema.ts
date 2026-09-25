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
export type OutcomeFormOutput = z.output<typeof OutcomeFormSchema>;

// Exported so the reversal dialog can hold a reason to the same limit before
// sending it: a paste far over it would otherwise fail on the request's size
// before this schema could say why.
export const REVERSAL_REASON_MAX_LENGTH = 1000;

// A reversal voids a closed record, and a void with no explanation is the
// first thing anyone auditing the record will ask about, so the reason is
// required. It is kept on the outcome and repeated in the animal's activity.
export const ReverseOutcomeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: "A reason for reversing this outcome is required." })
    .max(REVERSAL_REASON_MAX_LENGTH, {
      error: `The reason cannot exceed ${REVERSAL_REASON_MAX_LENGTH} characters.`,
    }),
});

export type ReverseOutcomeInput = z.input<typeof ReverseOutcomeSchema>;