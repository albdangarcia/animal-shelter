"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  withAuthenticatedUser,
  RequirePermission,
  type SessionUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { AnimalActivityType } from "@/prisma/generated/enums";
import {
  buildAssessmentSchema,
  type AssessmentFormValues,
} from "../zod-schemas/assessment.schemas";
import {
  getActiveTemplate,
  type AssessmentTemplateDef,
} from "../assessments/templates";
import {
  concerningFieldKeys,
  normalizeAnswerValue,
} from "../assessments/answers";
import { deriveSignal, formatSignal } from "../assessments/signal";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type AssessmentResult = FormResult<AssessmentFormValues>;

const invalidFields = (
  error: z.ZodError,
): FieldErrors<AssessmentFormValues> =>
  z.flattenError(error).fieldErrors as FieldErrors<AssessmentFormValues>;

/**
 * Resolve the persisted template row for a registry key at its active version.
 * The registry is the source of truth for structure; the row supplies the
 * foreign keys an assessment and its answers point at.
 */
type TemplateRow = {
  id: string;
  name: string;
  fields: { id: string; key: string; label: string }[];
};

type ResolvedTemplate =
  | { ok: false; error: string }
  | { ok: true; def: AssessmentTemplateDef; row: TemplateRow };

const resolveTemplate = async (
  templateKey: unknown,
): Promise<ResolvedTemplate> => {
  if (typeof templateKey !== "string") {
    return { ok: false, error: "No assessment template was selected." };
  }
  const def = getActiveTemplate(templateKey);
  if (!def) {
    return {
      ok: false,
      error: "That assessment template is no longer available.",
    };
  }
  const row = await prisma.assessmentTemplate.findUnique({
    where: { key_version: { key: def.key, version: def.version } },
    select: {
      id: true,
      name: true,
      fields: { select: { id: true, key: true, label: true } },
    },
  });
  if (!row) {
    return {
      ok: false,
      error:
        "That assessment template has not been set up yet. Contact an administrator.",
    };
  }
  return { ok: true, def, row };
};

type ResolvedTemplateRow = TemplateRow;

interface PreparedAnswer {
  templateFieldId: string;
  questionLabel: string;
  value: string;
  valueNumber: number | null;
  notes: string | null;
}

/** Turn a validated submission into the answer rows worth persisting. */
const prepareAnswers = (
  def: AssessmentTemplateDef,
  row: ResolvedTemplateRow,
  values: AssessmentFormValues,
): PreparedAnswer[] => {
  const rowFieldByKey = new Map(row.fields.map((f) => [f.key, f]));
  const prepared: PreparedAnswer[] = [];

  for (const field of def.fields) {
    const rowField = rowFieldByKey.get(field.key);
    if (!rowField) continue;

    const entry = values.fields[field.key];
    const { value, valueNumber } = normalizeAnswerValue(field, entry?.value);
    const notes = entry?.note?.trim() ? entry.note.trim() : null;

    // Nothing recorded and no note to keep — store no row for this field.
    if (value === null && notes === null) continue;

    prepared.push({
      templateFieldId: rowField.id,
      questionLabel: rowField.label,
      value: value ?? "",
      valueNumber,
      notes,
    });
  }

  return prepared;
};

const logActivity = (
  tx: TransactionClient,
  args: {
    animalId: string;
    personId: string;
    activityType: AnimalActivityType;
    changeSummary: string;
    changedAt?: Date;
  },
) =>
  tx.animalActivityLog.create({
    data: {
      animalId: args.animalId,
      activityType: args.activityType,
      changedById: args.personId,
      changeSummary: args.changeSummary,
      ...(args.changedAt ? { changedAt: args.changedAt } : {}),
    },
  });

const revalidate = (animalId: string) => {
  revalidatePath(`/dashboard/animals/${animalId}/assessments`);
  revalidatePath(`/dashboard/animals/${animalId}`);
};

const _createAssessment = async (
  user: SessionUser,
  animalId: string,
  rawValues: AssessmentFormValues,
): Promise<AssessmentResult> => {
  if (!cuidSchema.safeParse(animalId).success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const resolved = await resolveTemplate(rawValues?.templateKey);
  if (!resolved.ok) {
    return { ok: false, message: resolved.error };
  }
  const { def, row } = resolved;

  const parsed = buildAssessmentSchema(def).safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Some answers need attention before this can be recorded.",
      fieldErrors: invalidFields(parsed.error),
    };
  }
  const values = parsed.data as AssessmentFormValues;

  const concerning = concerningFieldKeys(def.fields, values.fields);
  const signal = deriveSignal(values.signal, concerning.length);
  const answers = prepareAnswers(def, row, values);

  try {
    await prisma.$transaction(async (tx) => {
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: { id: true },
      });
      if (!animal) throw new Error("Animal not found.");

      const assessment = await tx.assessment.create({
        data: {
          animalId,
          templateId: row.id,
          assessorId: user.personId,
          observedAt: values.observedAt,
          signal,
          summary: values.summary?.trim() || null,
          answers: { create: answers },
        },
        select: { id: true },
      });

      await logActivity(tx, {
        animalId,
        personId: user.personId,
        activityType: AnimalActivityType.ASSESSMENT_COMPLETED,
        changeSummary: `${row.name} assessment recorded — ${formatSignal(signal)}.`,
        changedAt: values.observedAt,
      });

      return assessment;
    });
  } catch (error) {
    console.error("Database Error creating assessment:", error);
    return {
      ok: false,
      message: "Database Error: Failed to record the assessment.",
    };
  }

  revalidate(animalId);
  return {
    ok: true,
    message: "Assessment recorded.",
    redirectTo: `/dashboard/animals/${animalId}/assessments`,
  };
};

const _updateAssessment = async (
  user: SessionUser,
  assessmentId: string,
  animalId: string,
  rawValues: AssessmentFormValues,
): Promise<AssessmentResult> => {
  if (!cuidSchema.safeParse(assessmentId).success) {
    return { ok: false, message: "Invalid assessment ID format." };
  }
  if (!cuidSchema.safeParse(animalId).success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const existing = await prisma.assessment.findFirst({
    where: { id: assessmentId, animalId, deletedAt: null },
    select: {
      template: { select: { key: true, version: true } },
      answers: {
        select: {
          id: true,
          value: true,
          valueNumber: true,
          notes: true,
          templateFieldId: true,
        },
      },
    },
  });
  if (!existing) {
    return { ok: false, message: "Assessment not found." };
  }

  // An assessment is edited against the exact template version it was recorded
  // on — the picker is locked in edit mode, so honour that here too.
  const def = getActiveTemplate(existing.template.key);
  const resolved = await resolveTemplate(existing.template.key);
  if (!resolved.ok || !def || def.version !== existing.template.version) {
    return {
      ok: false,
      message:
        "This assessment was recorded against a template version that can no longer be edited.",
    };
  }
  const { row } = resolved;

  const parsed = buildAssessmentSchema(def).safeParse({
    ...rawValues,
    templateKey: existing.template.key,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Some answers need attention before this can be saved.",
      fieldErrors: invalidFields(parsed.error),
    };
  }
  const values = parsed.data as AssessmentFormValues;

  const concerning = concerningFieldKeys(def.fields, values.fields);
  const signal = deriveSignal(values.signal, concerning.length);
  const prepared = prepareAnswers(def, row, values);
  const preparedByFieldId = new Map(
    prepared.map((answer) => [answer.templateFieldId, answer]),
  );
  const existingByFieldId = new Map(
    existing.answers.map((answer) => [answer.templateFieldId, answer]),
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          observedAt: values.observedAt,
          signal,
          summary: values.summary?.trim() || null,
        },
      });

      // Diff answers by their stable template-field FK — never delete the whole
      // set and rebuild it, which is how the previous build lost answers.
      for (const answer of prepared) {
        const prior = existingByFieldId.get(answer.templateFieldId);
        if (!prior) {
          await tx.assessmentAnswer.create({
            data: { assessmentId, ...answer },
          });
          continue;
        }
        const unchanged =
          prior.value === answer.value &&
          prior.valueNumber === answer.valueNumber &&
          (prior.notes ?? null) === answer.notes;
        if (unchanged) continue;

        // Keep the original questionLabel snapshot; only the recorded answer
        // and its note are a correction.
        await tx.assessmentAnswer.update({
          where: { id: prior.id },
          data: {
            value: answer.value,
            valueNumber: answer.valueNumber,
            notes: answer.notes,
          },
        });
      }

      const removedIds = existing.answers
        .filter((a) => !preparedByFieldId.has(a.templateFieldId))
        .map((a) => a.id);
      if (removedIds.length > 0) {
        await tx.assessmentAnswer.deleteMany({
          where: { id: { in: removedIds } },
        });
      }

      await logActivity(tx, {
        animalId,
        personId: user.personId,
        activityType: AnimalActivityType.FIELD_UPDATE,
        changeSummary: `An assessment was updated — ${formatSignal(signal)}.`,
      });
    });
  } catch (error) {
    console.error("Database Error updating assessment:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update the assessment.",
    };
  }

  revalidate(animalId);
  return {
    ok: true,
    message: "Assessment updated.",
    redirectTo: `/dashboard/animals/${animalId}/assessments`,
  };
};

const _setAssessmentDeleted = async (
  user: SessionUser,
  assessmentId: string,
  animalId: string,
  deleted: boolean,
): Promise<{ message: string }> => {
  if (
    !cuidSchema.safeParse(assessmentId).success ||
    !cuidSchema.safeParse(animalId).success
  ) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.assessment.updateMany({
        where: { id: assessmentId, animalId },
        data: { deletedAt: deleted ? new Date() : null },
      });
      if (updated.count === 0) throw new Error("Assessment not found.");

      await logActivity(tx, {
        animalId,
        personId: user.personId,
        activityType: AnimalActivityType.FIELD_UPDATE,
        changeSummary: `An assessment was ${deleted ? "deleted" : "restored"}.`,
      });
    });
  } catch (error) {
    console.error("Database Error changing assessment state:", error);
    return {
      message: `Database Error: Failed to ${deleted ? "delete" : "restore"} the assessment.`,
    };
  }

  revalidate(animalId);
  return {
    message: `Assessment ${deleted ? "deleted" : "restored"}.`,
  };
};

export const createAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(_createAssessment),
);

export const updateAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(_updateAssessment),
);

export const deleteAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(
    (user: SessionUser, assessmentId: string, animalId: string) =>
      _setAssessmentDeleted(user, assessmentId, animalId, true),
  ),
);

export const restoreAssessment = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_ASSESSMENT_MANAGE)(
    (user: SessionUser, assessmentId: string, animalId: string) =>
      _setAssessmentDeleted(user, assessmentId, animalId, false),
  ),
);
