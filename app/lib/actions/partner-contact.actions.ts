"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { PartnerContactFormSchema } from "../zod-schemas/partners-directory.schemas";
import { z } from "zod";

export type PartnerContactFormState = {
  success?: boolean;
  message?: string | null;
  errors?: {
    personId?: string[];
    role?: string[];
    isPrimary?: string[];
    isActive?: string[];
  };
};

const revalidateContacts = (partnerId: string) => {
  revalidatePath(`/dashboard/partners-directory/${partnerId}`);
  revalidatePath(`/dashboard/partners-directory/${partnerId}/contacts`);
};

const _addPartnerContact = async (
  partnerId: string,
  prevState: PartnerContactFormState,
  formData: FormData,
): Promise<PartnerContactFormState> => {
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedPartnerId.success) {
    return { message: "Invalid partner ID format." };
  }

  const raw = Object.fromEntries(formData.entries());
  const validatedFields = PartnerContactFormSchema.safeParse({
    ...raw,
    isPrimary: formData.get("isPrimary") !== null,
    isActive: formData.get("isActive") !== null,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to add contact.",
    };
  }

  const { personId, role, isPrimary, isActive } = validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      // If this contact will be primary, demote any existing primary first
      // so the partial unique index isn't violated.
      if (isPrimary) {
        await tx.partnerContact.updateMany({
          where: { partnerId: parsedPartnerId.data, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await tx.partnerContact.create({
        data: {
          partnerId: parsedPartnerId.data,
          personId,
          role: role || null,
          isPrimary: isPrimary ?? false,
          isActive: isActive ?? true,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { personId: ["This person is already a contact here."] },
        message: "Failed to add contact.",
      };
    }
    console.error("Database Error adding partner contact:", error);
    return {
      success: false,
      message: "Database Error: Failed to add contact.",
    };
  }

  revalidateContacts(parsedPartnerId.data);
  return { success: true, message: "Contact added successfully." };
};

const _updatePartnerContact = async (
  contactId: string,
  partnerId: string,
  prevState: PartnerContactFormState,
  formData: FormData,
): Promise<PartnerContactFormState> => {
  const parsedContactId = cuidSchema.safeParse(contactId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedContactId.success || !parsedPartnerId.success) {
    return { message: "Invalid ID format." };
  }

  const raw = Object.fromEntries(formData.entries());
  const validatedFields = PartnerContactFormSchema.safeParse({
    ...raw,
    isPrimary: formData.get("isPrimary") !== null,
    isActive: formData.get("isActive") !== null,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update contact.",
    };
  }

  // personId is locked in edit mode, we don't change who the contact is.
  const { role, isPrimary, isActive } = validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        // Demote any OTHER primary (not this row) before promoting this one.
        await tx.partnerContact.updateMany({
          where: {
            partnerId: parsedPartnerId.data,
            isPrimary: true,
            id: { not: parsedContactId.data },
          },
          data: { isPrimary: false },
        });
      }

      await tx.partnerContact.update({
        where: { id: parsedContactId.data },
        data: {
          role: role || null,
          isPrimary: isPrimary ?? false,
          isActive: isActive ?? true,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return { message: "Contact not found." };
      }
    }
    console.error("Database Error updating partner contact:", error);
    return {
      success: false,
      message: "Database Error: Failed to update contact.",
    };
  }

  revalidateContacts(parsedPartnerId.data);
  return { success: true, message: "Contact updated successfully." };
};

export type SetPrimaryResult = {
  success: boolean;
  message: string;
  previousPrimary: { id: string; name: string } | null;
  newPrimary: { id: string; name: string } | null;
};

const _setPrimaryContact = async (
  contactId: string,
  partnerId: string,
): Promise<SetPrimaryResult> => {
  const parsedContactId = cuidSchema.safeParse(contactId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedContactId.success || !parsedPartnerId.success) {
    return {
      success: false,
      message: "Invalid ID format.",
      previousPrimary: null,
      newPrimary: null,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find the current primary (if any) BEFORE changing anything — this is
      // what the toast reports and what Undo reverts to.
      const current = await tx.partnerContact.findFirst({
        where: { partnerId: parsedPartnerId.data, isPrimary: true },
        select: { id: true, person: { select: { name: true } } },
      });

      // If the target is already primary, nothing to do.
      if (current?.id === parsedContactId.data) {
        return { previous: null, alreadyPrimary: true, newName: null };
      }

      // Demote the existing primary (if any), then promote the target.
      if (current) {
        await tx.partnerContact.update({
          where: { id: current.id },
          data: { isPrimary: false },
        });
      }

      const promoted = await tx.partnerContact.update({
        where: { id: parsedContactId.data },
        data: { isPrimary: true, isActive: true },
        select: { person: { select: { name: true } } },
      });

      return {
        previous: current
          ? { id: current.id, name: current.person.name }
          : null,
        alreadyPrimary: false,
        newName: promoted.person.name,
      };
    });

    if (result.alreadyPrimary) {
      return {
        success: true,
        message: "This contact is already the primary.",
        previousPrimary: null,
        newPrimary: null,
      };
    }

    revalidateContacts(parsedPartnerId.data);

    return {
      success: true,
      message: result.previous
        ? `Primary changed from ${result.previous.name} to ${result.newName}.`
        : `${result.newName} set as primary contact.`,
      previousPrimary: result.previous,
      newPrimary: { id: parsedContactId.data, name: result.newName! },
    };
  } catch (error) {
    console.error("Error setting primary contact:", error);
    return {
      success: false,
      message: "Failed to set primary contact.",
      previousPrimary: null,
      newPrimary: null,
    };
  }
};

const _setContactActive = async (
  contactId: string,
  partnerId: string,
  isActive: boolean,
): Promise<{ success: boolean; message: string }> => {
  const parsedContactId = cuidSchema.safeParse(contactId);
  const parsedPartnerId = cuidSchema.safeParse(partnerId);
  if (!parsedContactId.success || !parsedPartnerId.success) {
    return { success: false, message: "Invalid ID format." };
  }

  try {
    await prisma.partnerContact.update({
      where: { id: parsedContactId.data },
      data: {
        isActive,
        // Deactivating a contact can't leave them as primary.
        ...(isActive ? {} : { isPrimary: false }),
      },
    });
  } catch (error) {
    console.error("Error updating contact active status:", error);
    return { success: false, message: "Failed to update contact." };
  }

  revalidateContacts(parsedPartnerId.data);
  return {
    success: true,
    message: isActive ? "Contact reactivated." : "Contact deactivated.",
  };
};

export const setPrimaryContact = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_setPrimaryContact);

export const setContactActive = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_setContactActive);

export const addPartnerContact = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_addPartnerContact);

export const updatePartnerContact = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_updatePartnerContact);