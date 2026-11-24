import { z } from "zod";
import {
  isUsStateCode,
  SHELTER_STATE_MESSAGE,
} from "@/app/lib/utils/shelter-settings";

// The shelter details form. The state is required here: the page sets it,
// and only a shelter no one has set up yet has none. The service runs the
// same rule and stays the authority.
export const ShelterDetailsFormSchema = z.object({
  state: z
    .string({ error: SHELTER_STATE_MESSAGE })
    .refine(isUsStateCode, { error: SHELTER_STATE_MESSAGE }),
});

export type ShelterDetailsFormInput = z.input<typeof ShelterDetailsFormSchema>;
export type ShelterDetailsFormValues = z.output<typeof ShelterDetailsFormSchema>;
