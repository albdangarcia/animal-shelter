"use client";

import { format } from "date-fns";
import type { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DateInput, type DateInputProps } from "@/components/forms/date-input";

type DateFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  /** Classes for the FormItem wrapper. */
  className?: string;
  /** Classes for the trigger button, forwarded to DateInput. */
  triggerClassName?: string;
} & Omit<
  DateInputProps,
  "value" | "onChange" | "aria-label" | "id" | "className"
>;

/**
 * A date picker wired into react-hook-form, mirroring NumberField.
 *
 * Owning the FormLabel is what lets this fix the trigger's accessible name.
 * FormLabel's `htmlFor` association wins over a button's content when the
 * accessible name is computed, so the plain trigger announces only "Due Date"
 * and never the date a sighted user can see. Because the label text is a prop
 * here, it can be composed with the value into an explicit aria-label — the
 * shadcn form primitives stay untouched.
 */
export function DateField<TValues extends FieldValues>({
  control,
  name,
  label,
  className,
  triggerClassName,
  ...inputProps
}: DateFieldProps<TValues>) {
  const { placeholder = "Pick a date" } = inputProps;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = field.value as Date | undefined;

        return (
          <FormItem className={className}>
            <FormLabel htmlFor={name}>{label}</FormLabel>
            <FormControl>
              <DateInput
                id={name}
                className={triggerClassName}
                value={value}
                onChange={field.onChange}
                aria-label={`${label}: ${
                  value ? format(value, "PPP") : placeholder
                }`}
                {...inputProps}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
