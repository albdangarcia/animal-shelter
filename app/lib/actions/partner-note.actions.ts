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
    await prisma.partnerNote.create({
      data: {
        content: validatedFields.data.content,
        partnerId: parsedPartnerId.data,
        authorId: user.personId,
      },
    });
  } catch (error) {
    console.error("Database Error creating partner note:", error);
    return { ok: false, message: "Database Error: Failed to create note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { ok: true, message: "Note created successfully." };
};

const _updatePartnerNote = async (
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

  try {
    await prisma.partnerNote.update({
      where: { id: parsedNoteId.data },
      data: { content: validatedFields.data.content },
    });
  } catch (error) {
    console.error("Database Error updating partner note:", error);
    return { ok: false, message: "Database Error: Failed to update note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { ok: true, message: "Note updated successfully." };
};

const _deletePartnerNote = async (
  noteId: string,
  partnerId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.partnerNote.update({
      where: { id: parsedNoteId.data },
      data: { deletedAt: new Date() },
    });
  } catch (error) {
    console.error("Database Error deleting partner note:", error);
    return { message: "Failed to delete note." };
  }

  revalidateNotes(parsedPartnerId.data);
  return { message: "Note deleted." };
};

const _restorePartnerNote = async (
  noteId: string,
  partnerId: string,
): Promise<{ message: string }> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  try {
    await prisma.partnerNote.update({
      where: { id: parsedNoteId.data },
      data: { deletedAt: null },
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

export const updatePartnerNote = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_updatePartnerNote);

export const deletePartnerNote = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_deletePartnerNote);

export const restorePartnerNote = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_restorePartnerNote);