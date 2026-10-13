import { z } from "zod";
import { requiredNumber } from "./common.schemas";

/**
 * The three measurements a vitals entry can hold, each with its bounds. The
 * Vitals page's form and the vitals measured during an exam share them.
 */
export const VitalsMeasurementsSchema = z.object({
  weightGrams: requiredNumber("Weight")
    .int({ error: "Weight must be a whole number of grams." })
    .positive({ error: "Weight must be a positive number." })
    .nullable(),
  // Bounded, not just a plain number — the range is a real clinical bound
  // (no live animal is at 0°C or 100°C), so it also catches genuine entry
  // mistakes.
  temperatureC: requiredNumber("Temperature")
    .min(20, { error: "Temperature must be at least 20°C." })
    .max(45, { error: "Temperature must be at most 45°C." })
    .nullable(),
  bodyConditionScore: requiredNumber("Body condition score")
    .int({ error: "Body condition score must be a whole number." })
    .min(1, { error: "Body condition score must be between 1 and 9." })
    .max(9, { error: "Body condition score must be between 1 and 9." })
    .nullable(),
});

export type VitalsMeasurements = z.output<typeof VitalsMeasurementsSchema>;

export const NO_MEASUREMENT_MESSAGE =
  "Record at least one measurement. Notes alone aren't enough.";

/** Whether any of the three measurements was taken. */
export const hasVitalsMeasurement = (
  measurements: Partial<Record<keyof VitalsMeasurements, number | null>>,
) =>
  measurements.weightGrams != null ||
  measurements.temperatureC != null ||
  measurements.bodyConditionScore != null;

// At least one of weightGrams / temperatureC / bodyConditionScore must be
// present — a notes-only entry belongs on the Notes tab, not here. Enforced
// below rather than at the field level so the error can be attached to a
// single visible input (weightGrams) instead of floating at the form root.
export const VitalsFormSchema = VitalsMeasurementsSchema.extend({
  recordedAt: z.date({
    error: (issue) =>
      issue.input === undefined ? "Recorded date is required." : undefined,
  }),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!hasVitalsMeasurement(data)) {
    ctx.addIssue({
      code: "custom",
      message: NO_MEASUREMENT_MESSAGE,
      path: ["weightGrams"],
    });
  }

  if (data.recordedAt > new Date()) {
    ctx.addIssue({
      code: "custom",
      message: "Recorded date cannot be in the future.",
      path: ["recordedAt"],
    });
  }
});

export type VitalsFormValues = z.infer<typeof VitalsFormSchema>;
export type VitalsFormInput = z.input<typeof VitalsFormSchema>;
