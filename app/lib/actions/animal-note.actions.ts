"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { NoteFormSchema } from "../zod-schemas/animal.schemas";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type NoteFormInput = z.input<typeof NoteFormSchema>;
type NoteResult = FormResult<NoteFormInput>;

const _createAnimalNote = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  values: NoteFormInput,
): Promise<NoteResult> => {
  const NoteAuthorId = user.personId;

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = NoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create animal.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<NoteFormInput>,
    };
  }

  const { category, content } = validatedFields.data;

  try {
    await prisma.animalNote.create({
      data: {
        category: category,
        content: content,
        animalId: parsedAnimalId.data,
        authorId: NoteAuthorId,
      },
    });
  } catch (error) {
    console.error("Database Error creating notes:", error);
    return { ok: false, message: "Database Error: Failed to create notes." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/notes`);

  return { ok: true, message: "Note created successfully." };
};

const _updateAnimalNote = async (
  noteId: string,
  animalId: string,
  values: NoteFormInput,
): Promise<NoteResult> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  if (!parsedNoteId.success) {
    return { ok: false, message: "Invalid note ID format." };
  }

  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }

  const validatedFields = NoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update note.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<NoteFormInput>,
    };
  }

  const { category, content } = validatedFields.data;

  try {
    await prisma.animalNote.update({
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
    return { ok: false, message: "Database Error: Failed to update note." };
  }

  revalidatePath(`/dashboard/animals/${animalId}/notes`);
  return { ok: true, message: "Note updated successfully." };
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
    await prisma.animalNote.update({
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
    await prisma.animalNote.update({
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
