import { z } from "zod";
import {
  DoseUnit,
  MedicalItemKind,
  MedicalRoute,
} from "@/prisma/generated/enums";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";
import { cuidSchema } from "./common.schemas";

const tidyName = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, " "));

const optionalText = z
  .string()
  .trim()
  .max(100, "Must be 100 characters or fewer.")
  .nullish()
  .transform((s) => (s ? s : null));

// The form's view of a catalog item. The kind rules here mirror the catalog
// service, which stays the authority, so the form can show them before submit.
// The form clears the fields a kind doesn't use before it submits.
export const MedicalItemFormSchema = z
  .object({
    kind: z.enum(MedicalItemKind),
    name: tidyName.pipe(
      z.string().min(1, "Name is required.").max(100, "Name is too long."),
    ),
    manufacturer: optionalText,
    speciesIds: z.array(cuidSchema),
    defaultRoute: z.enum(MedicalRoute).nullable(),
    defaultDoseAmount: z
      .number()
      .positive("The dose must be more than zero.")
      .nullable(),
    defaultDoseUnit: z.enum(DoseUnit).nullable(),
    repeatIntervalDays: z
      .number()
      .int("Use a whole number of days.")
      .min(1, "At least one day.")
      .max(
        MAX_REPEAT_INTERVAL_DAYS,
        `At most ${MAX_REPEAT_INTERVAL_DAYS} days (five years).`,
      )
      .nullable(),
    isRabies: z.boolean(),
    analytes: z.array(
      z.object({
        id: cuidSchema.nullish(),
        name: tidyName.pipe(
          z
            .string()
            .min(1, "Every analyte needs a name.")
            .max(100, "Name is too long."),
        ),
      }),
    ),
  })
  .superRefine((item, ctx) => {
    if (item.isRabies && item.kind !== MedicalItemKind.VACCINE) {
      ctx.addIssue({
        code: "custom",
        path: ["isRabies"],
        message: "Only a vaccine can be a rabies vaccine.",
      });
    }
    if (item.kind === MedicalItemKind.TEST && item.defaultRoute) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultRoute"],
        message: "A test has no default route.",
      });
    }
    if (
      item.kind !== MedicalItemKind.TREATMENT &&
      (item.defaultDoseAmount !== null || item.defaultDoseUnit)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultDoseAmount"],
        message: "Only a treatment has a default dose.",
      });
    }
    if (item.defaultDoseAmount !== null && !item.defaultDoseUnit) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultDoseUnit"],
        message: "A default dose needs a unit.",
      });
    }
    if (item.kind === MedicalItemKind.TEST) {
      if (item.analytes.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["analytes"],
          message:
            "A test needs at least one analyte: what the test reports a result for.",
        });
      }
      const seen = new Set<string>();
      for (const analyte of item.analytes) {
        const key = analyte.name.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["analytes"],
            message: `The analyte "${analyte.name}" is listed twice.`,
          });
        }
        seen.add(key);
      }
    } else if (item.analytes.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["analytes"],
        message: "Only a test has analytes.",
      });
    }
  });

export type MedicalItemFormInput = z.input<typeof MedicalItemFormSchema>;
export type MedicalItemFormValues = z.output<typeof MedicalItemFormSchema>;
