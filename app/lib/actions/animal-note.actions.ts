"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { NoteFormSchema } from "../zod-schemas/animal.schemas";

export interface AnimalNoteFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    category?: string[];
    content?: string[];
  };
}

const _createAnimalNote = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  prevState: AnimalNoteFormState,
  formData: FormData
): Promise<AnimalNoteFormState> => {
  const NoteAuthorId = user.personId;

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { success: false, message: "Invalid animal ID format." };
  }

  const validatedFields = NoteFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to create animal.",
    };
  }

  const { category, content } = validatedFields.data;

  try {
    await prisma.note.create({
      data: {
        category: category,
        content: content,
        animalId: parsedAnimalId.data,
        authorId: NoteAuthorId,
      },
    });
  } catch (error) {
    console.error("Database Error creating notes:", error);
    return {
      success: false,
      message: "Database Error: Failed to create notes.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}/notes`);

  return {
    success: true,
    message: "Note created successfully.",
  };
};

const _updateAnimalNote = async (
  noteId: string,
  animalId: string,
  prevState: AnimalNoteFormState,
  formData: FormData
): Promise<AnimalNoteFormState> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  if (!parsedNoteId.success) {
    return {
      success: false,
      message: "Invalid note ID format.",
    };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return {
      success: false,
      message: "Invalid animal ID format.",
    };
  }

  // Validate the form fields
  const validatedFields = NoteFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to update note.",
    };
  }

  const { category, content } = validatedFields.data;

  try {
    await prisma.note.update({
      where: {
        id: parsedNoteId.data,
        animalId: parsedAnimalId.data,
      },
      data: {
        category: category,
        content: content,
      },
    });
  } catch (error) {
    console.error("Database Error updating note:", error);
    return {
      success: false,
      message: "Database Error: Failed to update note.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}/notes`);
  return {
    success: true,
    message: "Note updated successfully.",
  };
};

const _deleteAnimalNote = async (
  noteId: string,
  animalId: string
): Promise<{ success: boolean; message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  if (!parsedNoteId.success) {
    return {
      success: false,
      message: "Invalid note ID format.",
    };
  }

  try {
    await prisma.note.update({
      where: {
        id: parsedNoteId.data,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    revalidatePath(`/dashboard/animals/${animalId}/notes`);
    return {
      success: true,
      message: "Note deleted successfully.",
    };
  } catch (error) {
    console.error("Database Error deleting note:", error);
    return {
      success: false,
      message: "Database Error: Failed to delete note.",
    };
  }
};

const _restoreAnimalNote = async (
  noteId: string,
  animalId: string
): Promise<{ success: boolean; message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  if (!parsedNoteId.success) {
    return {
      success: false,
      message: "Invalid note ID format.",
    };
  }

  try {
    await prisma.note.update({
      where: {
        id: parsedNoteId.data,
      },
      data: {
        deletedAt: null,
      },
    });

    revalidatePath(`/dashboard/animals/${animalId}/notes`);
    return {
      success: true,
      message: "Note restored successfully.",
    };
  } catch (error) {
    console.error("Database Error restoring note:", error);
    return {
      success: false,
      message: "Database Error: Failed to restore note.",
    };
  }
};

export const deleteAnimalNote = RequirePermission(
  AppPermissions.ANIMAL_NOTE_MANAGE
)(_deleteAnimalNote);

export const restoreAnimalNote = RequirePermission(
  AppPermissions.ANIMAL_NOTE_MANAGE
)(_restoreAnimalNote);

export const createAnimalNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_NOTE_MANAGE)(_createAnimalNote)
);

export const updateAnimalNote = RequirePermission(
  AppPermissions.ANIMAL_NOTE_MANAGE
)(_updateAnimalNote);
