import { WEIGHT_UNIT_SYSTEM } from "@/app/lib/constants/constants";

export type WeightUnit = "g" | "kg" | "oz" | "lb";

const GRAMS_PER_OUNCE = 28.349523125;
const GRAMS_PER_POUND = 453.59237;

const GRAMS_PER_UNIT: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: GRAMS_PER_OUNCE,
  lb: GRAMS_PER_POUND,
};

// The two units offered by the entry-form toggle, small unit first. Which pair
// depends on the org-wide WEIGHT_UNIT_SYSTEM, not a per-user preference.
export const WEIGHT_UNITS: readonly [WeightUnit, WeightUnit] =
  WEIGHT_UNIT_SYSTEM === "imperial" ? ["oz", "lb"] : ["g", "kg"];

export function toGrams(value: number, unit: WeightUnit): number {
  return value * GRAMS_PER_UNIT[unit];
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  return grams / GRAMS_PER_UNIT[unit];
}

// Rounds a unit-converted value for display in a weight entry input: whole
// grams (unit is already the finest granularity), 2dp for kg/oz/lb.
export function roundForUnit(value: number, unit: WeightUnit): number {
  return unit === "g" ? Math.round(value) : Math.round(value * 100) / 100;
}

// Which of the two WEIGHT_UNITS should be pre-selected, based on the magnitude
// of a previous weight entry (e.g. a 180g kitten defaults to oz, not lb).
// Falls back to the large unit when there's no prior entry to infer from.
export function inferWeightUnit(
  previousWeightGrams: number | null | undefined
): WeightUnit {
  const [small, large] = WEIGHT_UNITS;
  if (previousWeightGrams == null) return large;
  const smallUnitCeilingGrams = GRAMS_PER_UNIT[large];
  return previousWeightGrams < smallUnitCeilingGrams ? small : large;
}

// Rounds to at most `maxDecimals` places and trims trailing zeros, keeping
// output like "3.4" instead of "3.40" while still allowing "3.45".
function trimDecimal(value: number, maxDecimals: number): string {
  const fixed = value.toFixed(maxDecimals);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

/**
 * Renders a gram value for display, magnitude-aware: metric shows grams under
 * 1000g and kilograms above; imperial shows ounces under 1lb and pounds above
 * (a 180g kitten is "6.3 oz", not "0.4 lb"). Returns "" for null/undefined so
 * it composes directly with components that already hide empty values.
 */
export function formatWeight(grams: number | null | undefined): string {
  if (grams == null) return "";

  if (WEIGHT_UNIT_SYSTEM === "imperial") {
    if (grams < GRAMS_PER_POUND) {
      return `${trimDecimal(grams / GRAMS_PER_OUNCE, 1)} oz`;
    }
    return `${trimDecimal(grams / GRAMS_PER_POUND, 2)} lb`;
  }

  if (grams < 1000) {
    return `${Math.round(grams)} g`;
  }
  return `${trimDecimal(grams / 1000, 2)} kg`;
}

/**
 * Renders a Celsius value for display. Same org-wide unit-system principle as
 * formatWeight: canonical storage is Celsius, Fahrenheit is a display-time
 * conversion for imperial shelters.
 */
export function formatTemperature(celsius: number | null | undefined): string {
  if (celsius == null) return "";

  if (WEIGHT_UNIT_SYSTEM === "imperial") {
    const fahrenheit = (celsius * 9) / 5 + 32;
    return `${trimDecimal(fahrenheit, 1)}°F`;
  }
  return `${trimDecimal(celsius, 1)}°C`;
}
