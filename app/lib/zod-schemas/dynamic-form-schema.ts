import { z } from "zod";
import { FieldType, AssessmentOutcome } from "@/prisma/generated/enums";
import { TemplateField } from "../types";

export function createDynamicSchema(fields: TemplateField[]) {
  const schemaFields: Record<string, z.ZodTypeAny> = {};

  fields.forEach((field) => {
    let fieldSchema: z.ZodTypeAny;

    switch (field.fieldType) {
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
        fieldSchema = z
          .string()
          .min(1, { error: `${field.label} is required` });
        break;
      case FieldType.NUMBER:
        fieldSchema = z.coerce
          .number()
          .min(0, { error: `${field.label} must be a positive number` });
        break;
      case FieldType.SELECT:
      case FieldType.RADIO:
        if (field.options && field.options.length > 0) {
          const optionValues = field.options.map((option) => {
            if (typeof option === "string") {
              return option; // If it's a string, use it directly
            }
            return option.value; // If it's an object, get its value
          });

          fieldSchema = z.enum(optionValues as [string, ...string[]], {
            error: () => `Please select a valid ${field.label}`,
          });
        } else {
          fieldSchema = z
            .string()
            .min(1, { error: `${field.label} is required` });
        }
        break;
      case FieldType.CHECKBOX:
        fieldSchema = z.boolean();
        break;
      case FieldType.DATE:
        fieldSchema = z.coerce.date({
          error: () => `${field.label} must be a valid date`,
        });
        break;
      default:
        fieldSchema = z
          .string()
          .min(1, { error: `${field.label} is required` });
    }

    // Apply optional if not required
    if (!field.isRequired) {
      fieldSchema = fieldSchema.optional().or(z.literal(""));
    }

    schemaFields[field.id] = fieldSchema;

    // Add a corresponding optional notes field for each assessment field
    schemaFields[`${field.id}_notes`] = z.string().optional();
  });

  // Add overall outcome and summary fields
  schemaFields.overallOutcome = z.enum(AssessmentOutcome).optional();
  schemaFields.summary = z.string().optional();

  return z.object(schemaFields);
}
