"use server";

import { revalidatePath } from "next/cache";
import z from "zod";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { TaskFormSchema } from "../zod-schemas/animal.schemas";
import {
  AnimalActivityType,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@/prisma/generated/enums";
import { NotFoundError } from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type TaskFormInput = z.input<typeof TaskFormSchema>;
type TaskResult = FormResult<TaskFormInput>;

// Every task mutation now writes an AnimalActivityLog entry, and its
// changedById is a required FK to Person. A session with no linked Person
// can't be the author of one, so — matching the guard in _createAnimal
// (animal.actions.ts) — these actions fail rather than assume a personId.
const MISSING_PERSON_MESSAGE =
  "Authentication Error: Your user account is not associated with a person record.";

// Shared by create and update. `details` maps "" to null so clearing the
// textarea actually clears the column — the old FormData builder skipped
// empty strings entirely, so the key never reached the server, Prisma saw
// undefined, and the write was silently skipped.
const toTaskData = (data: z.output<typeof TaskFormSchema>) => ({
  title: data.title,
  details: data.details?.trim() ? data.details : null,
  status: data.status,
  category: data.category,
  priority: data.priority,
  dueDate: data.dueDate ?? null,
  assigneeId: data.assigneeId,
});

// The rollup diff for the edit form. `status` and `assigneeId` are excluded:
// each has its own dedicated activity type (TASK_STATUS_CHANGED, TASK_ASSIGNED)
// and is logged separately by _updateAnimalTask, so that the same change reads
// the same way whether it arrived through the form or a dedicated quick-action.
// Everything else here rolls up into a single TASK_UPDATED entry.
//
// An `undefined` on the incoming side means the form didn't carry that optional
// field, which Prisma treats as "leave alone" — so it isn't a change.
const changedTaskFields = (
  next: ReturnType<typeof toTaskData>,
  prev: {
    title: string;
    details: string | null;
    category: TaskCategory;
    priority: TaskPriority;
    dueDate: Date | null;
  },
): string[] => {
  const changed: string[] = [];
  if (next.title !== prev.title) changed.push("title");
  // toTaskData already maps "" -> null, but a legacy row may hold "", so
  // normalise both sides: an empty string and null mean the same thing here.
  if ((next.details ?? "") !== (prev.details ?? "")) changed.push("details");
  if (next.category !== prev.category) changed.push("category");
  if (next.priority !== undefined && next.priority !== prev.priority) {
    changed.push("priority");
  }
  // Two Date instances are never ===, even for the same instant, and a cleared
  // date arrives as null — compare by epoch, treating null as "no date".
  const nextDue = next.dueDate?.getTime() ?? null;
  const prevDue = prev.dueDate?.getTime() ?? null;
  if (nextDue !== prevDue) changed.push("due date");
  return changed;
};

// Assign / reassign / unassign, logged as TASK_ASSIGNED with a name in the
// summary. Shared by _updateAnimalTaskAssignee (the assignee cell) and
// _updateAnimalTask (the edit form) so the wording is identical either way.
// No-ops when the assignee is unchanged. Runs inside the caller's transaction.
const logAssigneeChange = async (
  tx: TransactionClient,
  params: {
    animalId: string;
    taskTitle: string;
    changedById: string;
    prevAssigneeId: string | null;
    nextAssigneeId: string | null;
  },
): Promise<void> => {
  const { animalId, taskTitle, changedById, prevAssigneeId, nextAssigneeId } =
    params;
  if (prevAssigneeId === nextAssigneeId) return;

  const ids = [prevAssigneeId, nextAssigneeId].filter(
    (id): id is string => id !== null,
  );
  const people = await tx.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string) =>
    people.find((p) => p.id === id)?.name ?? "someone";

  let summary: string;
  if (prevAssigneeId === null && nextAssigneeId !== null) {
    summary = `Task "${taskTitle}" assigned to ${nameOf(nextAssigneeId)}.`;
  } else if (prevAssigneeId !== null && nextAssigneeId === null) {
    summary = `Task "${taskTitle}" unassigned from ${nameOf(prevAssigneeId)}.`;
  } else if (prevAssigneeId !== null && nextAssigneeId !== null) {
    summary = `Task "${taskTitle}" reassigned from ${nameOf(prevAssigneeId)} to ${nameOf(nextAssigneeId)}.`;
  } else {
    return; // both null — already guarded above, here for exhaustiveness
  }

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.TASK_ASSIGNED,
      changedById,
      changeSummary: summary,
    },
  });
};

const _createAnimalTask = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  values: TaskFormInput,
): Promise<TaskResult> => {
  const taskCreatorId = user.personId;
  if (!taskCreatorId) {
    return { ok: false, message: MISSING_PERSON_MESSAGE };
  }

  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = TaskFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create task.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<TaskFormInput>,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.create({
        data: {
          ...toTaskData(validatedFields.data),
          animalId: parsedId.data,
          createdById: taskCreatorId,
        },
      });

      await tx.animalActivityLog.create({
        data: {
          animalId: parsedId.data,
          activityType: AnimalActivityType.TASK_CREATED,
          changedById: taskCreatorId,
          changeSummary: `Task "${validatedFields.data.title}" was created.`,
        },
      });
    });
  } catch (error) {
    console.error("Database Error creating task:", error);
    return { ok: false, message: "Database Error: Failed to create task." };
  }

  revalidatePath(`/dashboard`);
  revalidatePath(`/dashboard/animals/${animalId}/tasks`);
  revalidatePath(`/dashboard/animal-tasks`);

  return { ok: true, message: "Task created successfully." };
};

const _updateAnimalTask = async (
  user: SessionUser,
  taskId: string,
  animalId: string,
  values: TaskFormInput,
): Promise<TaskResult> => {
  const editorId = user.personId;
  if (!editorId) {
    return { ok: false, message: MISSING_PERSON_MESSAGE };
  }

  const parsedTaskId = cuidSchema.safeParse(taskId);
  if (!parsedTaskId.success) {
    return { ok: false, message: "Invalid task ID format." };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = TaskFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update task.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<TaskFormInput>,
    };
  }

  const nextData = toTaskData(validatedFields.data);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: {
          id: parsedTaskId.data,
          animalId: parsedAnimalId.data, // Ensures the task belongs to the correct animal
        },
        select: {
          title: true,
          details: true,
          status: true,
          category: true,
          priority: true,
          dueDate: true,
          assigneeId: true,
        },
      });

      if (!existing) {
        throw new NotFoundError("Task not found for this animal.");
      }

      await tx.task.update({
        where: { id: parsedTaskId.data },
        data: nextData,
      });

      // Fields with a dedicated activity type are logged as that type, no
      // matter which UI produced the change. One save can emit up to three
      // entries: TASK_STATUS_CHANGED, TASK_ASSIGNED, and a TASK_UPDATED
      // rollup for whatever else changed. None fire if nothing changed.
      if (nextData.status !== undefined && nextData.status !== existing.status) {
        await tx.animalActivityLog.create({
          data: {
            animalId: parsedAnimalId.data,
            activityType: AnimalActivityType.TASK_STATUS_CHANGED,
            changedById: editorId,
            changeSummary: `Task "${nextData.title}" status changed from ${existing.status} to ${nextData.status}.`,
          },
        });
      }

      if (
        nextData.assigneeId !== undefined &&
        nextData.assigneeId !== existing.assigneeId
      ) {
        await logAssigneeChange(tx, {
          animalId: parsedAnimalId.data,
          taskTitle: nextData.title,
          changedById: editorId,
          prevAssigneeId: existing.assigneeId,
          nextAssigneeId: nextData.assigneeId,
        });
      }

      // Everything else that changed on this save. Mirrors _updateAnimal:
      // only write the log when a value actually differs.
      const fields = changedTaskFields(nextData, existing);
      if (fields.length > 0) {
        await tx.animalActivityLog.create({
          data: {
            animalId: parsedAnimalId.data,
            activityType: AnimalActivityType.TASK_UPDATED,
            changedById: editorId,
            changeSummary: `Task "${nextData.title}" updated: ${fields.join(", ")}.`,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, message: error.message };
    }
    console.error("Database Error updating task:", error);
    return { ok: false, message: "Database Error: Failed to update task." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/tasks`);
  revalidatePath(`/dashboard/animal-tasks`);
  revalidatePath(`/dashboard`);

  return { ok: true, message: "Task updated successfully." };
};

// The two actions below are field-less mutations, not forms: no schema, no
// react-hook-form, nothing for FormResult to carry field errors about. They
// keep their existing { success, message } shape and are called from plain
// async click handlers wrapped in useTransition.

const _updateTaskStatus = async (
  user: SessionUser,
  taskId: string,
  status: TaskStatus,
): Promise<{ success: boolean; message: string }> => {
  const editorId = user.personId;
  if (!editorId) {
    return { success: false, message: MISSING_PERSON_MESSAGE };
  }

  const parsedTaskId = cuidSchema.safeParse(taskId);
  if (!parsedTaskId.success) {
    return { success: false, message: "Invalid task ID format." };
  }

  let animalId: string;
  try {
    animalId = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({
        where: { id: parsedTaskId.data },
        select: { status: true, title: true },
      });

      if (!existing) {
        throw new NotFoundError("Task not found.");
      }

      // The animal id is no longer a parameter — it was validated and then
      // never read, since the where clause is the task id alone. It comes
      // back from the write instead, still needed for revalidation.
      const task = await tx.task.update({
        where: { id: parsedTaskId.data },
        data: { status },
        select: { animalId: true },
      });

      if (existing.status !== status) {
        await tx.animalActivityLog.create({
          data: {
            animalId: task.animalId,
            activityType: AnimalActivityType.TASK_STATUS_CHANGED,
            changedById: editorId,
            changeSummary: `Task "${existing.title}" status changed from ${existing.status} to ${status}.`,
          },
        });
      }

      return task.animalId;
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { success: false, message: error.message };
    }
    console.error("Database Error updating task status:", error);
    return {
      success: false,
      message: "Database Error: Failed to update task status.",
    };
  }

  revalidatePath(`/dashboard`);
  revalidatePath(`/dashboard/animals/${animalId}/tasks`);
  revalidatePath(`/dashboard/animal-tasks`);

  return { success: true, message: `Task status updated to ${status}.` };
};

const UpdateAssigneeSchema = z.object({
  taskId: z.string().min(1, "Task ID is required."),
  assigneeId: z.string().nullable(),
});

const _updateAnimalTaskAssignee = async (
  user: SessionUser,
  taskId: string,
  assigneeId: string | null,
): Promise<{ success: boolean; message: string }> => {
  const editorId = user.personId;
  if (!editorId) {
    return { success: false, message: MISSING_PERSON_MESSAGE };
  }

  const parsed = UpdateAssigneeSchema.safeParse({ taskId, assigneeId });
  if (!parsed.success) {
    return { success: false, message: "Invalid assignee update request." };
  }
  const { taskId: validTaskId, assigneeId: nextAssigneeId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({
        where: { id: validTaskId },
        select: {
          title: true,
          animalId: true,
          assigneeId: true,
        },
      });

      if (!existing) {
        throw new NotFoundError("Task not found.");
      }

      if (existing.assigneeId === nextAssigneeId) {
        return; // No change — skip the write and the log entry.
      }

      await tx.task.update({
        where: { id: validTaskId },
        data: { assigneeId: nextAssigneeId },
      });

      await logAssigneeChange(tx, {
        animalId: existing.animalId,
        taskTitle: existing.title,
        changedById: editorId,
        prevAssigneeId: existing.assigneeId,
        nextAssigneeId,
      });
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { success: false, message: error.message };
    }
    console.error("Database Error updating assignee:", error);
    return {
      success: false,
      message: "Failed to update assignee. Please try again.",
    };
  }

  // Revalidate the paths to refresh the data on the pages that show tasks.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/animals");
  revalidatePath("/dashboard/animal-tasks");

  return { success: true, message: "Assignee updated successfully." };
};

export const updateAnimalTaskAssignee = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_updateAnimalTaskAssignee),
);

export const updateAnimalTaskStatus = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_updateTaskStatus),
);

export const updateAnimalTask = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_updateAnimalTask),
);

export const createAnimalTask = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_createAnimalTask),
);
