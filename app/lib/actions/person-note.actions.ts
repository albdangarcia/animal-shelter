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
import { PersonNoteFormSchema } from "../zod-schemas/people-directory.schemas";
import { z } from "zod";

export type PersonNoteFormState = {
  success?: boolean;
  message?: string | null;
  errors?: {
    content?: string[];
  };
};

const revalidateNotes = (personId: string) => {
  revalidatePath(`/dashboard/people-directory/${personId}`);
  revalidatePath(`/dashboard/people-directory/${personId}/notes`);
};

const _createPersonNote = async (
  user: SessionUser,
  personId: string, // the SUBJECT person (note is about them)
  prevState: PersonNoteFormState,
  formData: FormData,
): Promise<PersonNoteFormState> => {
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedPersonId.success) {
    return { success: false, message: "Invalid person ID format." };
  }

  const validatedFields = PersonNoteFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create note.",
    };
  }

  try {
    await prisma.personNote.create({
      data: {
        content: validatedFields.data.content,
        personId: parsedPersonId.data, // subject
        authorId: user.personId, // author = session user
      },
    });
  } catch (error) {
    console.error("Database Error creating person note:", error);
    return {
      success: false,
      message: "Database Error: Failed to create note.",
    };
  }

  revalidateNotes(parsedPersonId.data);
  return { success: true, message: "Note created successfully." };
};

const _updatePersonNote = async (
  noteId: string,
  personId: string,
  prevState: PersonNoteFormState,
  formData: FormData,
): Promise<PersonNoteFormState> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedNoteId.success || !parsedPersonId.success) {
    return { success: false, message: "Invalid ID format." };
  }

  const validatedFields = PersonNoteFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update note.",
    };
  }

  try {
    await prisma.personNote.update({
      where: { id: parsedNoteId.data },
      data: { content: validatedFields.data.content },
    });
  } catch (error) {
    console.error("Database Error updating person note:", error);
    return {
      success: false,
      message: "Database Error: Failed to update note.",
    };
  }

  revalidateNotes(parsedPersonId.data);
  return { success: true, message: "Note updated successfully." };
};

const _deletePersonNote = async (
  noteId: string,
  personId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedNoteId.success || !parsedPersonId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.personNote.update({
      where: { id: parsedNoteId.data },
      data: { deletedAt: new Date() },
    });
  } catch (error) {
    console.error("Database Error deleting person note:", error);
    return { message: "Failed to delete note." };
  }

  revalidateNotes(parsedPersonId.data);
  return { message: "Note deleted." };
};

const _restorePersonNote = async (
  noteId: string,
  personId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedNoteId.success || !parsedPersonId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.personNote.update({
      where: { id: parsedNoteId.data },
      data: { deletedAt: null },
    });
  } catch (error) {
    console.error("Database Error restoring person note:", error);
    return { message: "Failed to restore note." };
  }

  revalidateNotes(parsedPersonId.data);
  return { message: "Note restored." };
};

export const createPersonNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.PERSONS_MANAGE)(_createPersonNote),
);

export const updatePersonNote = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_updatePersonNote);

export const deletePersonNote = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_deletePersonNote);

export const restorePersonNote = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_restorePersonNote);