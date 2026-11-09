"use client";

import type { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { NumberField } from "@/components/forms/number-field";
import { WeightInput } from "@/components/forms/weight-input";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";

/**
 * The three measurements a vitals entry holds: weight in the shelter's units,
 * temperature and body condition score. The Vitals page's form and the exam
 * form share them; an exam holds them under `vitals.`.
 */
export function VitalsMeasurementFields<TValues extends FieldValues>({
  control,
  prefix = "",
  unitSystem,
  inferWeightFrom,
  cellClassName,
}: {
  control: Control<TValues>;
  /** Where the measurements sit in the form's values: "" or "vitals.". */
  prefix?: "" | "vitals.";
  unitSystem: WeightUnitSystem;
  /** Grams: the animal's last known weight, to pick the unit shown. */
  inferWeightFrom?: number | null;
  cellClassName?: string;
}) {
  const name = (field: string) => `${prefix}${field}` as Path<TValues>;
  return (
    <>
      <FormField
        control={control}
        name={name("weightGrams")}
        render={({ field }) => (
          <FormItem className={cellClassName}>
            <FormLabel>Weight</FormLabel>
            <FormControl>
              <WeightInput
                unitSystem={unitSystem}
                placeholder="0"
                value={field.value}
                onChange={field.onChange}
                inferFrom={inferWeightFrom}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <NumberField
        control={control}
        name={name("temperatureC")}
        label="Temperature (°C)"
        className={cellClassName}
        decimal
        placeholder="38.5"
      />

      <NumberField
        control={control}
        name={name("bodyConditionScore")}
        label="Body Condition Score (1-9)"
        className={cellClassName}
        min={1}
        max={9}
        placeholder="5"
      />
    </>
  );
}
