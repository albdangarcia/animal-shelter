import { z } from "zod";
import {
  DOSE_TIME_FORMAT_MESSAGE,
  DOSE_TIME_PATTERN,
  doseSlotEndsIssue,
} from "@/app/lib/utils/shelter-settings";

const doseTime = z
  .string()
  .trim()
  .regex(DOSE_TIME_PATTERN, DOSE_TIME_FORMAT_MESSAGE);

// The dose-times form, keyed by slot. Each field is checked on its own first;
// the order of the three is checked once all are times, under the later slot.
// The service runs the same rules and stays the authority.
export const DoseTimesFormSchema = z
  .object({ AM: doseTime, MIDDAY: doseTime, PM: doseTime })
  .superRefine((ends, ctx) => {
    // A malformed time already has its message, which this would repeat.
    if (![ends.AM, ends.MIDDAY, ends.PM].every((time) => DOSE_TIME_PATTERN.test(time))) {
      return;
    }
    const issue = doseSlotEndsIssue(ends);
    if (issue) {
      ctx.addIssue({ code: "custom", path: [issue.slot], message: issue.message });
    }
  });

export type DoseTimesFormInput = z.input<typeof DoseTimesFormSchema>;
export type DoseTimesFormValues = z.output<typeof DoseTimesFormSchema>;
