"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  WEIGHT_UNITS,
  type WeightUnit,
  toGrams,
  fromGrams,
  roundForUnit,
  inferWeightUnit,
} from "@/app/lib/utils/weight-format";

type WeightInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  /** Grams — the canonical stored unit. */
  value: number | null | undefined;
  /** Grams — never called with undefined, matching NumberInput's contract. */
  onChange: (value: number | null) => void;
};

// Owns the g/kg/oz/lb toggle and the toGrams/fromGrams round-trip so no call
// site has to get that conversion right on its own. Speaks number | null in
// grams to react-hook-form; the toggle only changes what's displayed.
export function WeightInput({ value, onChange, ...props }: WeightInputProps) {
  const grams = value ?? null;
  const [unit, setUnit] = React.useState<WeightUnit>(() =>
    inferWeightUnit(grams),
  );

  const displayValue =
    grams == null ? "" : String(roundForUnit(fromGrams(grams, unit), unit));

  return (
    <div className="flex gap-2">
      <Input
        {...props}
        type="number"
        step="any"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const parsed = Number(raw);
          onChange(
            Number.isNaN(parsed) ? null : Math.round(toGrams(parsed, unit)),
          );
        }}
        // A stray scroll over a focused number input silently changes its value.
        onWheel={(e) => e.currentTarget.blur()}
      />
      <div className="flex rounded-md border overflow-hidden shrink-0">
        {WEIGHT_UNITS.map((u) => (
          <Button
            key={u}
            type="button"
            size="sm"
            variant={u === unit ? "default" : "ghost"}
            className="rounded-none px-2"
            onClick={() => setUnit(u)}
          >
            {u}
          </Button>
        ))}
      </div>
    </div>
  );
}
