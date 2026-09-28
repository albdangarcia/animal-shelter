"use client";

import type { ComponentProps } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { NumberInput } from "@/components/forms/number-input";

type NumberFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  className?: string;
  /** Marks the label with the required asterisk. Not passed to the input. */
  required?: boolean;
} & Omit<ComponentProps<typeof NumberInput>, "value" | "onChange">;

export function NumberField<TValues extends FieldValues>({
  control,
  name,
  label,
  className,
  required = false,
  ...inputProps
}: NumberFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel htmlFor={name} required={required}>
            {label}
          </FormLabel>
          <FormControl>
            <NumberInput id={name} {...inputProps} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
