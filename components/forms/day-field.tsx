"use client";

import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DateInput, type DateInputProps } from "@/components/forms/date-input";

type DayFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  /** Classes for the FormItem wrapper. */
  className?: string;
  /** Classes for the trigger button, forwarded to DateInput. */
  triggerClassName?: string;
  /** A line under the picker, above any validation message. */
  description?: ReactNode;
} & Omit<
  DateInputProps,
  "value" | "onChange" | "aria-label" | "id" | "className"
>;

/**
 * A calendar picker for a field that holds a calendar day — DateField's
 * sibling, for the columns that store `yyyy-MM-dd` rather than an instant.
 * See docs/calendar-days.md for which is which.
 *
 * The field's value is the day string itself. The calendar works in Dates, so
 * this converts at both edges: the day is read as a plain local date for the
 * grid to highlight, and the day clicked is written back with `format`, which
 * reads off that same local date. No timezone enters the round trip, so the
 * day stored is the day the human saw themselves click — which is not true of
 * submitting the Date, since its midnight lands on the previous day for anyone
 * ahead of the shelter's zone.
 *
 * It owns the FormLabel for the same reason DateField does: the label's
 * `htmlFor` association wins over the trigger's own content when the accessible
 * name is computed, so the name has to be composed here.
 */
export function DayField<TValues extends FieldValues>({
  control,
  name,
  label,
  className,
  triggerClassName,
  description,
  ...inputProps
}: DayFieldProps<TValues>) {
  const { placeholder = "Pick a date" } = inputProps;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const day = field.value as string | undefined;
        const picked = day ? parseISO(day) : undefined;
        const value =
          picked && !Number.isNaN(picked.getTime()) ? picked : undefined;

        return (
          <FormItem className={className}>
            <FormLabel htmlFor={name}>{label}</FormLabel>
            <FormControl>
              <DateInput
                id={name}
                className={triggerClassName}
                value={value}
                onChange={(date) =>
                  field.onChange(date ? format(date, "yyyy-MM-dd") : undefined)
                }
                aria-label={`${label}: ${
                  value ? format(value, "PPP") : placeholder
                }`}
                {...inputProps}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
