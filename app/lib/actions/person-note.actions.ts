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
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type PersonNoteFormInput = z.input<typeof PersonNoteFormSchema>;
type PersonNoteResult = FormResult<PersonNoteFormInput>;

const revalidateNotes = (personId: string) => {
  revalidatePath(`/dashboard/people-directory/${personId}`);
  revalidatePath(`/dashboard/people-directory/${personId}/notes`);
};

const _createPersonNote = async (
  user: SessionUser,
  personId: string, // the SUBJECT person (note is about them)
  values: PersonNoteFormInput,
): Promise<PersonNoteResult> => {
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedPersonId.success) {
    return { ok: false, message: "Invalid person ID format." };
  }

  const validatedFields = PersonNoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create note.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PersonNoteFormInput>,
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
    return { ok: false, message: "Database Error: Failed to create note." };
  }

  revalidateNotes(parsedPersonId.data);
  return { ok: true, message: "Note created successfully." };
};

const _updatePersonNote = async (
  noteId: string,
  personId: string,
  values: PersonNoteFormInput,
): Promise<PersonNoteResult> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedNoteId.success || !parsedPersonId.success) {
    return { ok: false, message: "Invalid ID format." };
  }

  const validatedFields = PersonNoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update note.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PersonNoteFormInput>,
    };
  }

  try {
    await prisma.personNote.update({
      where: { id: parsedNoteId.data },
      data: { content: validatedFields.data.content },
    });
  } catch (error) {
    console.error("Database Error updating person note:", error);
    return { ok: false, message: "Database Error: Failed to update note." };
  }

  revalidateNotes(parsedPersonId.data);
  return { ok: true, message: "Note updated successfully." };
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