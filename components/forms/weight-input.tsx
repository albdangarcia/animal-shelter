"use client";

import * as React from "react";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/forms/number-input";
import {
  weightUnits,
  type WeightUnit,
  toGrams,
  fromGrams,
  roundForUnit,
  inferWeightUnit,
} from "@/app/lib/utils/weight-format";

type WeightInputProps = Omit<
  React.ComponentProps<typeof NumberInput>,
  "value" | "onChange" | "decimal"
> & {
  /** Grams — the canonical stored unit. */
  value: number | null | undefined;
  /** Grams — never called with undefined, matching NumberInput's contract. */
  onChange: (value: number | null) => void;
  /** Grams. Unit to pre-select from when `value` is empty at mount — e.g. the
   *  animal's last known weight, so a 180g kitten opens on oz rather than lb. */
  inferFrom?: number | null;
  unitSystem: WeightUnitSystem;
};

// Owns the g/kg/oz/lb toggle and the toGrams/fromGrams round-trip so no call
// site has to get that conversion right on its own. Speaks number | null in
// grams to react-hook-form; the toggle only changes what's displayed.
export function WeightInput({
  value,
  onChange,
  inferFrom,
  unitSystem,
  ...props
}: WeightInputProps) {
  const grams = value ?? null;
  const [selection, setSelection] = React.useState<{
    system: WeightUnitSystem;
    unit: WeightUnit;
  }>(() => ({
    system: unitSystem,
    unit: inferWeightUnit(grams ?? inferFrom, unitSystem),
  }));
  // A new server setting takes effect in this render, even if React preserves
  // the mounted form. The stored selection is only valid for its own system.
  const unit =
    selection.system === unitSystem
      ? selection.unit
      : inferWeightUnit(grams ?? inferFrom, unitSystem);

  const displayValue =
    grams == null ? null : roundForUnit(fromGrams(grams, unit), unit);

  return (
    <div className="flex gap-2">
      <NumberInput
        {...props}
        decimal
        value={displayValue}
        onChange={(parsed) => {
          onChange(
            parsed == null ? null : Math.round(toGrams(parsed, unit)),
          );
        }}
      />
      <div className="flex rounded-md border overflow-hidden shrink-0">
        {weightUnits(unitSystem).map((u) => (
          <Button
            key={u}
            type="button"
            size="sm"
            variant={u === unit ? "default" : "ghost"}
            className="h-full rounded-none px-2"
            onClick={() => setSelection({ system: unitSystem, unit: u })}
          >
            {u}
          </Button>
        ))}
      </div>
    </div>
  );
}
