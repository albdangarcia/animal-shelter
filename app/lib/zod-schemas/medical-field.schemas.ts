import { z } from "zod";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

/** A day that may be left empty: "" and null both read as no day. */
export const optionalDay = (label: string) =>
  z
    .string()
    .nullish()
    .transform((value, ctx): CalendarDay | null => {
      if (!value) return null;
      const day = parseCalendarDay(value);
      if (day === null) {
        ctx.addIssue({ code: "custom", message: `${label} isn't a valid date.` });
        return z.NEVER;
      }
      return day;
    });

