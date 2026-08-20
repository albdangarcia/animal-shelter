"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  /** Allow decimals. Defaults to false (integers only). */
  decimal?: boolean;
};

export function NumberInput({
  value,
  onChange,
  decimal = false,
  step,
  inputMode,
  ...props
}: NumberInputProps) {
  return (
    <Input
      {...props}
      type="number"
      step={step ?? (decimal ? "any" : 1)}
      inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
      // Empty must be null, never undefined: react-hook-form treats undefined
      // as "no value at this key" and resolves the field back to its
      // defaultValue, which is what made the last digit undeletable.
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const parsed = Number(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      // A stray scroll over a focused number input silently changes its value.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}
