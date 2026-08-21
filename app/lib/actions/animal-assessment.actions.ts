"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import { createDynamicSchema } from "../zod-schemas/dynamic-form-schema";
import { TemplateField } from "../types";
import {
  withAuthenticatedUser,
  SessionUser,
  RequirePermission,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { AnimalActivityType, AssessmentOutcome } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "../utils/enum-formatter";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// The dynamic form's field set is generated per-template, so its values type
// can't be a named interface the way every other converted form's can — it's
// keyed by template field id (a cuid), decided at runtime.
type AssessmentFormInput = Record<string, unknown>;
type AssessmentResult = FormResult<AssessmentFormInput>;

const AssessmentOutputSchema = z.looseObject({
  overallOutcome: z.enum(AssessmentOutcome).optional(),
  summary: z.string().optional(),
});

// Internal action wrapped for authentication
const _createAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  templateId: string,
  values: AssessmentFormInput,
): Promise<AssessmentResult> => {
  const assessorId = user.personId;

  if (!animalId || !templateId) {
    return { ok: false, message: "Missing animal or template ID." };
  }

  try {
    // Fetch the template to build the dynamic schema
    const template = await prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      include: { templateFields: true },
    });
    if (!template) {
      return { ok: false, message: "Assessment template not found" };
    }

    const allFields: TemplateField[] =
      template.templateFields as TemplateField[];
    const schema = createDynamicSchema(allFields);
    // Always re-validate on the server: client validation is UX, not
    // enforcement, and this schema is rebuilt from the template fetched above
    // rather than trusted from the client.
    const validatedFields = schema.safeParse(values);
    if (!validatedFields.success) {
      return {
        ok: false,
        message: "Missing or invalid fields. Failed to create assessment.",
        fieldErrors: z.flattenError(validatedFields.error)
          .fieldErrors as FieldErrors<AssessmentFormInput>,
      };
    }

    const parsedOutput = AssessmentOutputSchema.safeParse(validatedFields.data);

    if (!parsedOutput.success) {
      return { ok: false, message: "Validated data has an unexpected structure." };
    }

    const { overallOutcome, summary } = parsedOutput.data;

    await prisma.assessment.create({
      data: {
        animalId,
        templateId,
        assessorId: assessorId,
        overallOutcome,
        summary,
        fields: {
          create: Object.entries(validatedFields.data)
            .filter(([key]) => !key.endsWith("_notes"))
            .filter(
              ([_, value]) =>
                value !== undefined && value !== null && value !== ""
            )
            .map(([fieldId, value]) => {
              const fieldDefinition = allFields.find((f) => f.id === fieldId);

              const noteValue = validatedFields.data[`${fieldId}_notes`];
              const notes = typeof noteValue === "string" ? noteValue : null;

              return {
                fieldName: fieldDefinition?.label || fieldId,
                fieldValue: String(value),
                notes: notes,
              };
            }),
        },
      },
    });
    // Create an activity log entry
    await prisma.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.ASSESSMENT_COMPLETED,
        changedById: assessorId,
        changeSummary: `${template.name} assessment completed with outcome: ${
          formatSingleEnumOption(overallOutcome) || "Not specified"
        }`,
      },
    });
  } catch (error) {
    console.error("Error creating assessment:", error);
    return { ok: false, message: "Database Error: Failed to create assessment." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/assessments`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  return {
    ok: true,
    message: "Assessment created successfully.",
    redirectTo: `/dashboard/animals/${animalId}/assessments`,
  };
};

const _updateAnimalAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  assessmentId: string,
  animalId: string,
  values: AssessmentFormInput,
): Promise<AssessmentResult> => {
  const parsedAssessmentId = cuidSchema.safeParse(assessmentId);
  if (!parsedAssessmentId.success) {
    return { ok: false, message: "Invalid assessment ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { templateId: true },
  });
  if (!assessment || !assessment.templateId) {
    return { ok: false, message: "Original assessment or its template not found." };
  }

  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: assessment.templateId },
    include: { templateFields: true },
  });
  if (!template) {
    return { ok: false, message: "Assessment template not found" };
  }

  const allFields: TemplateField[] = template.templateFields as TemplateField[];
  const schema = createDynamicSchema(allFields);
  const validatedFields = schema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update assessment.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<AssessmentFormInput>,
    };
  }

  const parsedOutput = AssessmentOutputSchema.safeParse(validatedFields.data);

  if (!parsedOutput.success) {
    return { ok: false, message: "Validated data has an unexpected structure." };
  }

  const { overallOutcome, summary } = parsedOutput.data;

  try {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        overallOutcome,
        summary,
        fields: {
          deleteMany: { assessmentId: assessmentId }, // Delete all old fields
          create: Object.entries(validatedFields.data) // Create new fields from form data
            .filter(([key]) => !key.endsWith("_notes"))
            .filter(
              ([_, value]) =>
                value !== undefined && value !== null && value !== ""
            )
            .map(([fieldId, value]) => {
              const fieldDefinition = allFields.find((f) => f.id === fieldId);

              const noteValue = validatedFields.data[`${fieldId}_notes`];
              const notes = typeof noteValue === "string" ? noteValue : null;

              return {
                fieldName: fieldDefinition?.label || fieldId,
                fieldValue: String(value),
                notes: notes,
              };
            }),
        },
      },
    });

    await prisma.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.FIELD_UPDATE,
        changedById: user.personId,
        changeSummary: `The "${
          template.name
        }" assessment was updated. New outcome: ${
          formatSingleEnumOption(overallOutcome) || "Not specified"
        }`,
      },
    });
  } catch (error) {
    console.error("Database Error updating assessment:", error);
    return { ok: false, message: "Database Error: Failed to update assessment." };
  }

  // parsedAnimalId.data, not parsedAnimalId — the template literal was
  // stringifying the whole SafeParseSuccess object, so the redirect (and now
  // the revalidated path) targeted "/dashboard/animals/[object Object]/...".
  revalidatePath(`/dashboard/animals/${parsedAnimalId.data}/assessments`);
  return {
    ok: true,
    message: "Assessment updated successfully.",
    redirectTo: `/dashboard/animals/${parsedAnimalId.data}/assessments`,
  };
};

const _deleteAnimalAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  assessmentId: string,
  animalId: string
) => {
  const parsedAssessmentId = cuidSchema.safeParse(assessmentId);
  if (!parsedAssessmentId.success) {
    return { message: "Invalid assessment ID format." };
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: parsedAssessmentId.data },
    include: { template: { select: { name: true } } },
  });

  if (!assessment) {
    return { message: "Assessment not found." };
  }

  try {
    await prisma.assessment.update({
      where: {
        id: parsedAssessmentId.data,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await prisma.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.FIELD_UPDATE,
        changedById: user.personId,
        changeSummary: `The "${
          assessment.template?.name || "Unknown"
        }" assessment was deleted.`,
      },
    });

    revalidatePath(`/dashboard/animals/${animalId}/assessments`);
    return { message: "Assessment deleted successfully." };
  } catch (error) {
    console.error("Database Error deleting assessment:", error);
    return {
      message: "Database Error: Failed to delete assessment.",
    };
  }
};

const _restoreAnimalAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  assessmentId: string,
  animalId: string
) => {
  const parsedAssessmentId = cuidSchema.safeParse(assessmentId);
  if (!parsedAssessmentId.success) {
    return { message: "Invalid assessment ID format." };
  }

  // Fetch assessment template name for a better summary message
  const assessment = await prisma.assessment.findUnique({
    where: { id: parsedAssessmentId.data },
    include: { template: { select: { name: true } } },
  });

  if (!assessment) {
    return { message: "Assessment not found." };
  }

  try {
    await prisma.assessment.update({
      where: {
        id: parsedAssessmentId.data,
      },
      data: {
        deletedAt: null,
      },
    });

    await prisma.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.FIELD_UPDATE,
        changedById: user.personId,
        changeSummary: `The "${
          assessment.template?.name || "Unknown"
        }" assessment was restored.`,
      },
    });

    revalidatePath(`/dashboard/animals/${animalId}/assessments`);
    return { message: "Assessment restored successfully." };
  } catch (error) {
    console.error("Database Error restoring assessment:", error);
    return {
      message: "Database Error: Failed to restore assessment.",
    };
  }
};

export const createAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(_createAssessment)
);

export const updateAnimalAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(
    _updateAnimalAssessment
  )
);

export const deleteAnimalAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(
    _deleteAnimalAssessment
  )
);

export const restoreAnimalAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(
    _restoreAnimalAssessment
  )
);
