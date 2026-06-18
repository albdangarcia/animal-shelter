"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { AnimalTaskFormState } from "../form-state-types";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { TaskFormSchema } from "../zod-schemas/animal.schemas";
import { TaskStatus } from "@prisma/client";
import z from "zod";

const _createAnimalTask = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  prevState: AnimalTaskFormState,
  formData: FormData
): Promise<AnimalTaskFormState> => {
  const taskCreatorId = user.personId;

  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    return { message: "Invalid animal ID format." };
  }

  const validatedFields = TaskFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to create task.",
    };
  }

  const { title, details, status, category, priority, dueDate, assigneeId } =
    validatedFields.data;

  try {
    await prisma.task.create({
      data: {
        title: title,
        details: details,
        status: status,
        category: category,
        priority: priority,
        dueDate: dueDate,
        animalId: parsedId.data,
        assigneeId: assigneeId,
        createdById: taskCreatorId,
      },
    });
  } catch (error) {
    console.error("Database Error creating task:", error);
    return {
      success: false,
      message: "Database Error: Failed to create task.",
    };
  }

  revalidatePath(`/dashboard`);
  revalidatePath(`/dashboard/animals/${animalId}/tasks`);
  revalidatePath(`/dashboard/animal-tasks`);

  return {
    success: true,
    message: "Task created successfully.",
  };
};

const _updateAnimalTask = async (
  taskId: string,
  animalId: string,
  prevState: AnimalTaskFormState,
  formData: FormData
): Promise<AnimalTaskFormState> => {
  const parsedTaskId = cuidSchema.safeParse(taskId);
  if (!parsedTaskId.success) {
    return { message: "Invalid task ID format." };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { message: "Invalid animal ID format." };
  }

  // Validate the form fields
  const validatedFields = TaskFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to update task.",
    };
  }

  const { title, details, status, category, priority, dueDate, assigneeId } =
    validatedFields.data;

  try {
    // Update the task in the database
    await prisma.task.update({
      where: {
        id: parsedTaskId.data,
        animalId: parsedAnimalId.data, // Ensures the task belongs to the correct animal
      },
      data: {
        title: title,
        details: details,
        status: status,
        category: category,
        priority: priority,
        dueDate: dueDate,
        assigneeId: assigneeId,
      },
    });
  } catch (error) {
    console.error("Database Error updating task:", error);
    return {
      success: false,
      message: "Database Error: Failed to update task.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}/tasks`);
  revalidatePath(`/dashboard/animal-tasks`);
  revalidatePath(`/dashboard`);

  return {
    success: true,
    message: "Task updated successfully.",
  };
};

const _updateTaskStatus = async (
  animalId: string,
  taskId: string,
  status: TaskStatus
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
  assigneeId: string | null
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
  AppPermissions.ANIMAL_TASK_MANAGE
)(_updateAnimalTaskAssignee);

export const updateAnimalTaskStatus = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE
)(_updateTaskStatus);

export const updateAnimalTask = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE
)(_updateAnimalTask);

export const createAnimalTask = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_createAnimalTask)
);
