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
import { PartnerNoteFormSchema } from "../zod-schemas/partners-directory.schemas";
import { NoteEventAction, NoteTargetType } from "@/prisma/generated/enums";
import {
  isNoteEditNoOp,
  NO_OP_EDIT_MESSAGE,
  recordNoteMutation,
} from "../services/note-audit";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type PartnerNoteFormInput = z.input<typeof PartnerNoteFormSchema>;
type PartnerNoteResult = FormResult<PartnerNoteFormInput>;

const revalidateNotes = (partnerId: string) => {
  revalidatePath(`/dashboard/partners-directory/${partnerId}`);
  revalidatePath(`/dashboard/partners-directory/${partnerId}/notes`);
};

const _createPartnerNote = async (
  user: SessionUser,
  partnerId: string,
  values: PartnerNoteFormInput,
): Promise<PartnerNoteResult> => {
  const parsedPartnerId = cuidSchema.safeParse(partnerId);

  if (!parsedPartnerId.success) {
    return { ok: false, message: "Invalid partner ID format." };
  }

  const validatedFields = PartnerNoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create note.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PartnerNoteFormInput>,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const note = await tx.partnerNote.create({
        data: {
          content: validatedFields.data.content,
          partnerId: parsedPartnerId.data,
          authorId: user.personId,
        },
        select: { id: true },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.PARTNER,
        targetId: note.id,
        action: NoteEventAction.CREATED,
        actorId: user.personId,
      });
    });
  } catch (error) {
    console.error("Database Error creating partner note:", error);
    return { ok: false, message: "Database Error: Failed to create note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { ok: true, message: "Note created successfully." };
};

const _updatePartnerNote = async (
  user: SessionUser,
  noteId: string,
  partnerId: string,
  values: PartnerNoteFormInput,
): Promise<PartnerNoteResult> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { ok: false, message: "Invalid ID format." };
  }

  const validatedFields = PartnerNoteFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update note.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PartnerNoteFormInput>,
    };
  }

  const { content } = validatedFields.data;

  const current = await prisma.partnerNote.findFirst({
    where: { id: parsedNoteId.data, partnerId: parsedPartnerId.data },
    select: { content: true },
  });
  if (!current) {
    return { ok: false, message: "Note not found." };
  }

  // Partner notes have no category, so compare content only.
  if (isNoteEditNoOp(current, { content })) {
    return { ok: true, message: NO_OP_EDIT_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partnerNote.update({
        where: { id: parsedNoteId.data },
        data: {
          content,
          lastEditedById: user.personId,
          lastEditedAt: new Date(),
        },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.PARTNER,
        targetId: parsedNoteId.data,
        action: NoteEventAction.EDITED,
        actorId: user.personId,
      });
    });
  } catch (error) {
    console.error("Database Error updating partner note:", error);
    return { ok: false, message: "Database Error: Failed to update note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { ok: true, message: "Note updated successfully." };
};

const _deletePartnerNote = async (
  user: SessionUser,
  noteId: string,
  partnerId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partnerNote.update({
        where: { id: parsedNoteId.data },
        data: {
          deletedAt: new Date(),
          lastEditedById: user.personId,
          lastEditedAt: new Date(),
        },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.PARTNER,
        targetId: parsedNoteId.data,
        action: NoteEventAction.DELETED,
        actorId: user.personId,
      });
    });
  } catch (error) {
    console.error("Database Error deleting partner note:", error);
    return { message: "Failed to delete note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { message: "Note deleted." };
};

const _restorePartnerNote = async (
  user: SessionUser,
  noteId: string,
  partnerId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partnerNote.update({
        where: { id: parsedNoteId.data },
        data: {
          deletedAt: null,
          lastEditedById: user.personId,
          lastEditedAt: new Date(),
        },
      });

      await recordNoteMutation(tx, {
        targetType: NoteTargetType.PARTNER,
        targetId: parsedNoteId.data,
        action: NoteEventAction.RESTORED,
        actorId: user.personId,
      });
    });
  } catch (error) {
    console.error("Database Error restoring partner note:", error);
    return { message: "Failed to restore note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { message: "Note restored." };
};

export const createPartnerNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.PARTNERS_MANAGE)(_createPartnerNote),
);

export const updatePartnerNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.PARTNERS_MANAGE)(_updatePartnerNote),
);

export const deletePartnerNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.PARTNERS_MANAGE)(_deletePartnerNote),
);

export const restorePartnerNote = withAuthenticatedUser(
  RequirePermission(AppPermissions.PARTNERS_MANAGE)(_restorePartnerNote),
);
