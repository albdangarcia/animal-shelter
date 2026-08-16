"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

// Define a state for the form action
export interface AssessmentFormState {
  message?: string | null;
  errors?: Record<string, string[] | undefined>;
}

const AssessmentOutputSchema = z.looseObject({
  overallOutcome: z.enum(AssessmentOutcome).optional(),
  summary: z.string().optional(),
});

// Internal action wrapped for authentication
const _createAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  prevState: AssessmentFormState,
  formData: FormData
): Promise<AssessmentFormState> => {
  const assessorId = user.personId;
  const data = Object.fromEntries(formData.entries());

  // Basic fields needed to find the template and create the schema
  const animalId = data.animalId as string;
  const templateId = data.templateId as string;

  if (!animalId || !templateId) {
    return { message: "Missing animal or template ID." };
  }

  try {
    // Fetch the template to build the dynamic schema
    const template = await prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      include: { templateFields: true },
    });
    if (!template) {
      return { message: "Assessment template not found" };
    }

    const allFields: TemplateField[] =
      template.templateFields as TemplateField[];
    const schema = createDynamicSchema(allFields);
    // Validate the form data against the dynamic schema
    const validatedFields = schema.safeParse(data);
    if (!validatedFields.success) {
      return {
        errors: z.flattenError(validatedFields.error).fieldErrors,
        message: "Missing or invalid fields. Failed to create assessment.",
      };
    }

    const parsedOutput = AssessmentOutputSchema.safeParse(validatedFields.data);

    if (!parsedOutput.success) {
      return { message: "Validated data has an unexpected structure." };
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
    return { message: "Database Error: Failed to create assessment." };
  }

  // Revalidate paths and redirect on success
  revalidatePath(`/dashboard/animals/${animalId}/assessments`);
  revalidatePath(`/dashboard/animals/${animalId}`);
  redirect(`/dashboard/animals/${animalId}/assessments`);
};

const _updateAnimalAssessment = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  assessmentId: string,
  animalId: string,
  prevState: AssessmentFormState,
  formData: FormData
): Promise<AssessmentFormState> => {
  const parsedAssessmentId = cuidSchema.safeParse(assessmentId);
  if (!parsedAssessmentId.success) {
    return { message: "Invalid assessment ID format." };
  }
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { templateId: true },
  });
  if (!assessment || !assessment.templateId) {
    return { message: "Original assessment or its template not found." };
  }

  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: assessment.templateId },
    include: { templateFields: true },
  });
  if (!template) {
    return { message: "Assessment template not found" };
  }

  const allFields: TemplateField[] = template.templateFields as TemplateField[];
  const schema = createDynamicSchema(allFields);
  const data = Object.fromEntries(formData.entries());
  const validatedFields = schema.safeParse(data);

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update assessment.",
    };
  }

  const parsedOutput = AssessmentOutputSchema.safeParse(validatedFields.data);

  if (!parsedOutput.success) {
    return { message: "Validated data has an unexpected structure." };
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
    return { message: "Database Error: Failed to update assessment." };
  }

  revalidatePath(`/dashboard/animals/${parsedAnimalId}/assessments`);
  redirect(`/dashboard/animals/${parsedAnimalId}/assessments`);
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
