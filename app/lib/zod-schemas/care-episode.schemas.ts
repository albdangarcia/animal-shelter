import { z } from "zod";
import { CareEpisodeType } from "@/prisma/generated/enums";
import { MEDICAL_REASON_MAX_LENGTH } from "@/app/lib/constants/medical";
import {
  optionalDay,
  optionalId,
  optionalText,
  requiredDay,
  requiredReason,
} from "./medical-entry.schemas";

// The care-episode forms' view of an episode. The rules that need nothing
// but the form's own values are mirrored from the care-episode service so
// the form can show them before submit; the service stays the authority,
// and checks what needs the animal, its other episodes or today.

/**
 * Opening an episode, or recording one already over with its end day, and
 * correcting one: the edit form sends every field, as the open form does.
 */
export const CareEpisodeFormSchema = z
  .object({
    type: z.enum(CareEpisodeType, { error: "Pick the kind of care." }),
    startDate: requiredDay("The start date"),
    endDate: optionalDay("The end date"),
    reason: z
      .string({ error: "Say why the animal is under care." })
      .trim()
      .min(1, { error: "Say why the animal is under care." })
      .max(MEDICAL_REASON_MAX_LENGTH, {
        error: `The reason can't be longer than ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      }),
    partnerId: optionalId,
    notes: optionalText(2000),
  })
  .superRefine(({ type, partnerId, startDate, endDate }, ctx) => {
    if (type === CareEpisodeType.HOSPITALISED_OFF_SITE && !partnerId) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerId"],
        message: "Pick the clinic the animal is hospitalised at.",
      });
    }
    if (type === CareEpisodeType.HOSPITALISED_IN_HOUSE && partnerId) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerId"],
        message: "A stay in house has no clinic.",
      });
    }
    if (endDate && endDate < startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date can't be before the start date.",
      });
    }
  });

export type CareEpisodeFormInput = z.input<typeof CareEpisodeFormSchema>;
export type CareEpisodeFormValues = z.output<typeof CareEpisodeFormSchema>;

/** Closing an open episode: the day it ended. */
export const CloseCareEpisodeSchema = z.object({
  endDate: requiredDay("The end date"),
});

export type CloseCareEpisodeInput = z.input<typeof CloseCareEpisodeSchema>;

export const VoidCareEpisodeSchema = z.object({
  reason: requiredReason("A reason for voiding this care episode is required."),
});

export type VoidCareEpisodeInput = z.input<typeof VoidCareEpisodeSchema>;
