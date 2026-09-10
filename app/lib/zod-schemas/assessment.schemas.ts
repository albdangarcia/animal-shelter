import { z } from "zod";
import { AssessmentSignal, FieldType } from "@/prisma/generated/enums";
import type { AssessmentTemplateDef } from "../assessments/templates";

// The recorded form is dynamic: its answer fields come from whichever template
// version is in play, so the schema is built per template rather than declared
// once. `buildAssessmentSchema` is pure and DB-free — the record action rebuilds
// it from the trusted registry definition and re-validates server-side.

const noteSchema = z
  .string()
  .trim()
  .max(500, { error: "A per-answer note is limited to 500 characters." })
  .optional();

const optionValues = (options: readonly string[]) =>
  options as unknown as [string, ...string[]];

const answerValueSchema = (fieldType: FieldType, options: readonly string[]) => {
  switch (fieldType) {
    case FieldType.NUMBER:
      return z
        .number({ error: "Enter a number." })
        .finite({ error: "Enter a number." })
        .nullable();
    case FieldType.BOOLEAN:
      return z.boolean();
    case FieldType.MULTI_SELECT:
      return z.array(z.enum(optionValues(options)));
    case FieldType.SINGLE_SELECT:
      return z.union([z.enum(optionValues(options)), z.literal("")]);
    default:
      return z.string();
  }
};

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

export function buildAssessmentSchema(template: AssessmentTemplateDef) {
  const fieldShape = Object.fromEntries(
    template.fields.map((field) => [
      field.key,
      z.object({
        value: answerValueSchema(field.fieldType, field.options ?? []),
        note: noteSchema,
      }),
    ]),
  );

  return z
    .object({
      templateKey: z.literal(template.key),
      observedAt: z.date({
        error: "An observation date is required.",
      }),
      signal: z.enum(AssessmentSignal),
      summary: z
        .string()
        .trim()
        .max(2000, { error: "The summary is limited to 2000 characters." })
        .optional(),
      fields: z.object(fieldShape),
    })
    .superRefine((data, ctx) => {
      if (data.observedAt.getTime() > Date.now()) {
        ctx.addIssue({
          code: "custom",
          message: "The observation date can't be in the future.",
          path: ["observedAt"],
        });
      }

      let requiredMissing = false;
      for (const field of template.fields) {
        if (!field.isRequired) continue;
        if (isBlank(data.fields[field.key]?.value)) {
          requiredMissing = true;
          ctx.addIssue({
            code: "custom",
            message: `${field.label} is required.`,
            path: ["fields", field.key, "value"],
          });
        }
      }

      // An assessment with no answers and no summary is just a timestamp
      // claiming an exam happened. Per-field `isRequired` can't catch this —
      // a template may have every field optional — so floor it here: at least
      // one recorded answer, or a summary. Skipped when a required field is
      // already flagged, since fixing that satisfies this too. The issue is
      // attached to `summary` because the form renders a message there; a
      // path with no rendered field would be swallowed silently.
      if (!requiredMissing) {
        const hasAnswer = template.fields.some(
          (field) => !isBlank(data.fields[field.key]?.value),
        );
        const hasSummary = (data.summary ?? "").trim().length > 0;
        if (!hasAnswer && !hasSummary) {
          ctx.addIssue({
            code: "custom",
            message:
              "Record at least one finding, or summarise what was observed.",
            path: ["summary"],
          });
        }
      }
    });
}

export type AssessmentAnswerInput = {
  value: string | number | boolean | string[] | null;
  note?: string;
};

export type AssessmentFormValues = {
  templateKey: string;
  observedAt: Date;
  signal: AssessmentSignal;
  summary?: string;
  fields: Record<string, AssessmentAnswerInput>;
};
