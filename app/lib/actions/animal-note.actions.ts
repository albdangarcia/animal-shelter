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
import { NoteEventAction, NoteTargetType } from "@/prisma/generated/enums";
import { formatSingleEnumOption } from "../utils/enum-formatter";
import {
  isNoteEditNoOp,
  NO_OP_EDIT_MESSAGE,
  recordNoteMutation,
} from "../services/note-audit";
import {
  noteRefusalMessage,
  softDeleteAnimalNote,
  restoreAnimalNoteRow,
} from "../services/note-delete-restore";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

// A delete or restore has no form, so no field errors to carry.
type NoteChangeResult = FormResult<Record<string, never>>;

type NoteFormInput = z.input<typeof NoteFormSchema>;
type NoteResult = FormResult<NoteFormInput>;

// Both the animal index (activity feed) and the notes tab render note state, so
// every animal note mutation must revalidate both — the feed lives at the index
// (`suffix: ""`), not a `/activity` segment.
const revalidateAnimalNotes = (animalId: string) => {
  revalidatePath(`/dashboard/animals/${animalId}/notes`);
  revalidatePath(`/dashboard/animals/${animalId}`);
};

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
    await prisma.$transaction(async (tx) => {
      const note = await tx.animalNote.create({
        data: {
          category,
          content,
          animalId: parsedAnimalId.data,
          authorId: NoteAuthorId,
        },
        select: { id: true, animalId: true, category: true },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.ANIMAL,
        targetId: note.id,
        action: NoteEventAction.CREATED,
        actorId: user.personId,
        animalId: note.animalId,
        categoryLabel: formatSingleEnumOption(note.category),
      });
    });
  } catch (error) {
    console.error("Database Error creating notes:", error);
    return { ok: false, message: "Database Error: Failed to create notes." };
  }

  revalidateAnimalNotes(parsedAnimalId.data);

  return { ok: true, message: "Note created successfully." };
};

const _updateAnimalNote = async (
  user: SessionUser, // Injected by withAuthenticatedUser
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

  const current = await prisma.animalNote.findFirst({
    where: { id: parsedNoteId.data, animalId: parsedAnimalId.data },
    select: { content: true, category: true },
  });
  if (!current) {
    return { ok: false, message: "Note not found." };
  }

  // Nothing changed, so no NoteEvent, no lastEditedBy bump,
  // no revalidation. `ok: true` so the dialog closes normally.
  if (isNoteEditNoOp(current, { content, category })) {
    return { ok: true, message: NO_OP_EDIT_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.animalNote.update({
        where: {
          id: parsedNoteId.data,
          animalId: parsedAnimalId.data,
        },
        data: {
          category,
          content,
          lastEditedById: user.personId,
          lastEditedAt: new Date(),
        },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.ANIMAL,
        targetId: parsedNoteId.data,
        action: NoteEventAction.EDITED,
        actorId: user.personId,
        animalId: parsedAnimalId.data,
        categoryLabel: formatSingleEnumOption(category),
      });
    });
  } catch (error) {
    console.error("Database Error updating note:", error);
    return { ok: false, message: "Database Error: Failed to update note." };
  }

  revalidateAnimalNotes(parsedAnimalId.data);
  return { ok: true, message: "Note updated successfully." };
};

const _deleteAnimalNote = async (
  user: SessionUser,
  noteId: string,
  animalId: string,
): Promise<NoteChangeResult> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedNoteId.success || !parsedAnimalId.success) {
    return { ok: false, message: "Invalid ID format." };
  }

  try {
    await prisma.$transaction((tx) =>
      softDeleteAnimalNote(
        tx,
        parsedNoteId.data,
        parsedAnimalId.data,
        user.personId,
      ),
    );
  } catch (error) {
    const refusal = noteRefusalMessage(error);
    if (refusal) return { ok: false, message: refusal };
    console.error("Database Error deleting animal note:", error);
    return { ok: false, message: "Database Error: Failed to delete note." };
  }

  revalidateAnimalNotes(parsedAnimalId.data);
  return { ok: true, message: "Note deleted successfully." };
};

const _restoreAnimalNote = async (
  user: SessionUser,
  noteId: string,
  animalId: string,
): Promise<NoteChangeResult> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedNoteId.success || !parsedAnimalId.success) {
    return { ok: false, message: "Invalid ID format." };
  }

  try {
    await prisma.$transaction((tx) =>
      restoreAnimalNoteRow(
        tx,
        parsedNoteId.data,
        parsedAnimalId.data,
        user.personId,
      ),
    );
  } catch (error) {
    const refusal = noteRefusalMessage(error);
    if (refusal) return { ok: false, message: refusal };
    console.error("Database Error restoring animal note:", error);
    return { ok: false, message: "Database Error: Failed to restore note." };
  }

  revalidateAnimalNotes(parsedAnimalId.data);
  return { ok: true, message: "Note restored successfully." };
};

export const deleteAnimalNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_NOTE_MANAGE)(_deleteAnimalNote),
);

export const restoreAnimalNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_NOTE_MANAGE)(_restoreAnimalNote),
);

export const createAnimalNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_NOTE_MANAGE)(_createAnimalNote),
);

export const updateAnimalNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_NOTE_MANAGE)(_updateAnimalNote),
);
