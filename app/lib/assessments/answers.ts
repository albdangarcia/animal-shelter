import { FieldType } from "@/prisma/generated/enums";
import type { AssessmentTemplateFieldDef } from "./templates";

/**
 * The shape a single answer arrives in from the form before it is written: a
 * select string, a number, a checkbox, a multi-select array, or nothing.
 */
export type RawAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | null
  | undefined;

export interface NormalizedAnswer {
  /**
   * The answer as a frozen string snapshot, or `null` when the field was left
   * blank (nothing is stored for a blank field).
   */
  value: string | null;
  /** Parallel numeric column, populated only for `NUMBER` fields. */
  valueNumber: number | null;
}

/**
 * Collapse a raw form value into the `(value, valueNumber)` pair that gets
 * persisted. A blank answer normalizes to `{ value: null }` so callers can
 * treat "field cleared" uniformly.
 */
export function normalizeAnswerValue(
  field: AssessmentTemplateFieldDef,
  raw: RawAnswerValue,
): NormalizedAnswer {
  switch (field.fieldType) {
    case FieldType.NUMBER: {
      const n =
        typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      return { value: n === null ? null : String(n), valueNumber: n };
    }
    case FieldType.BOOLEAN: {
      if (raw === true || raw === "true") {
        return { value: "true", valueNumber: null };
      }
      if (raw === false || raw === "false") {
        return { value: "false", valueNumber: null };
      }
      return { value: null, valueNumber: null };
    }
    case FieldType.MULTI_SELECT: {
      const picked = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
      return {
        value: picked.length > 0 ? picked.join(", ") : null,
        valueNumber: null,
      };
    }
    default: {
      // SHORT_TEXT, LONG_TEXT, SINGLE_SELECT
      const s = typeof raw === "string" ? raw.trim() : "";
      return { value: s === "" ? null : s, valueNumber: null };
    }
  }
}

/**
 * Whether the given answer selects one of the field's concerning values —
 * the check that floors the assessment's signal.
 */
export function isConcerningAnswer(
  field: AssessmentTemplateFieldDef,
  raw: RawAnswerValue,
): boolean {
  const concerning = field.concerningValues ?? [];
  if (concerning.length === 0) return false;

  if (field.fieldType === FieldType.MULTI_SELECT) {
    const picked = Array.isArray(raw) ? raw.map(String) : [];
    return picked.some((v) => concerning.includes(v));
  }

  const { value } = normalizeAnswerValue(field, raw);
  return value !== null && concerning.includes(value);
}

/** The concerning answers in a full form submission, by field key. */
export function concerningFieldKeys(
  fields: readonly AssessmentTemplateFieldDef[],
  answers: Record<string, { value: RawAnswerValue } | undefined>,
): string[] {
  return fields
    .filter((f) => isConcerningAnswer(f, answers[f.key]?.value))
    .map((f) => f.key);
}
