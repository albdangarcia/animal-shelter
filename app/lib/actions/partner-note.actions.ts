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

export type PartnerNoteFormState = {
  success?: boolean;
  message?: string | null;
  errors?: {
    content?: string[];
  };
};

const revalidateNotes = (partnerId: string) => {
  revalidatePath(`/dashboard/partners-directory/${partnerId}`);
  revalidatePath(`/dashboard/partners-directory/${partnerId}/notes`);
};

const _createPartnerNote = async (
  user: SessionUser,
  partnerId: string,
  prevState: PartnerNoteFormState,
  formData: FormData,
): Promise<PartnerNoteFormState> => {
  const parsedPartnerId = cuidSchema.safeParse(partnerId);

  if (!parsedPartnerId.success) {
    return { message: "Invalid partner ID format." };
  }

  const validatedFields = PartnerNoteFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create note.",
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
    return {
      success: false,
      message: "Database Error: Failed to create note.",
    };
  }

  revalidateNotes(parsedPartnerId.data);
  return { success: true, message: "Note created successfully." };
};

const _updatePartnerNote = async (
  noteId: string,
  partnerId: string,
  prevState: PartnerNoteFormState,
  formData: FormData,
): Promise<PartnerNoteFormState> => {
  const parsedNoteId = cuidSchema.safeParse(noteId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedNoteId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  const validatedFields = PartnerNoteFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update note.",
    };
  }

  try {
    await prisma.partnerNote.update({
      where: { id: parsedNoteId.data },
      data: { content: validatedFields.data.content },
    });
  } catch (error) {
    console.error("Database Error updating partner note:", error);
    return {
      success: false,
      message: "Database Error: Failed to update note.",
    };
  }

  revalidateNotes(parsedPartnerId.data);
  return { success: true, message: "Note updated successfully." };
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