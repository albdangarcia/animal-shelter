"use server";

import { revalidatePath } from "next/cache";
import z from "zod";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { TaskFormSchema } from "../zod-schemas/animal.schemas";
import type { TaskStatus } from "@/prisma/generated/enums";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type TaskFormInput = z.input<typeof TaskFormSchema>;
type TaskResult = FormResult<TaskFormInput>;

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

const _createAnimalTask = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  values: TaskFormInput,
): Promise<TaskResult> => {
  const taskCreatorId = user.personId;

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
    await prisma.task.create({
      data: {
        ...toTaskData(validatedFields.data),
        animalId: parsedId.data,
        createdById: taskCreatorId,
      },
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
  taskId: string,
  animalId: string,
  values: TaskFormInput,
): Promise<TaskResult> => {
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

  try {
    await prisma.task.update({
      where: {
        id: parsedTaskId.data,
        animalId: parsedAnimalId.data, // Ensures the task belongs to the correct animal
      },
      data: toTaskData(validatedFields.data),
    });
  } catch (error) {
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
  animalId: string,
  taskId: string,
  status: TaskStatus,
): Promise<{ success: boolean; message: string }> => {
  const parsedTaskId = cuidSchema.safeParse(taskId);
  if (!parsedTaskId.success) {
    return { success: false, message: "Invalid task ID format." };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { success: false, message: "Invalid animal ID format." };
  }

  try {
    await prisma.task.update({
      where: { id: parsedTaskId.data },
      data: { status: status },
    });
  } catch (error) {
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
  taskId: string,
  assigneeId: string | null,
): Promise<{ success: boolean; message: string }> => {
  try {
    const validatedData = UpdateAssigneeSchema.parse({ taskId, assigneeId });

    await prisma.task.update({
      where: { id: validatedData.taskId },
      data: {
        assigneeId: validatedData.assigneeId,
      },
    });

    // Revalidate the path to refresh the data on the page
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/animals");
    revalidatePath("/dashboard/animal-tasks");

    return { success: true, message: "Assignee updated successfully." };
  } catch (error) {
    console.error("Database Error updating assignee:", error);
    return {
      success: false,
      message: "Failed to update assignee. Please try again.",
    };
  }
};

export const updateAnimalTaskAssignee = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE,
)(_updateAnimalTaskAssignee);

export const updateAnimalTaskStatus = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE,
)(_updateTaskStatus);

export const updateAnimalTask = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE,
)(_updateAnimalTask);

export const createAnimalTask = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_createAnimalTask),
);