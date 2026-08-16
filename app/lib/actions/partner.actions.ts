"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { PartnerFormState } from "../form-state-types";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { PartnerFormSchema } from "../zod-schemas/partners-directory.schemas";
import { z } from "zod";

const _createPartner = async (
  prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> => {
  const raw = Object.fromEntries(formData.entries());
  
  const validatedFields = PartnerFormSchema.safeParse({
    ...raw,
    // Checkboxes submit "on" or are absent; normalize to boolean.
    isActive: formData.get("isActive") !== null,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create partner.",
    };
  }

  const {
    name,
    type,
    email,
    phone,
    website,
    address,
    city,
    state,
    zipCode,
    isActive,
    notes,
  } = validatedFields.data;

  let newPartnerId: string;

  try {
    const partner = await prisma.partner.create({
      data: {
        name,
        type,
        email: email || null,
        phone: phone || null,
        website: website || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        isActive: isActive ?? true,
        notes: notes || null,
      },
    });
    newPartnerId = partner.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { name: ["A partner with this name already exists."] },
        message: "Failed to create partner.",
      };
    }
    console.error("Database Error creating partner:", error);
    return {
      success: false,
      message: "Database Error: Failed to create partner.",
    };
  }

  revalidatePath("/dashboard/partners-directory");
  redirect(`/dashboard/partners-directory/${newPartnerId}`);
};

const _updatePartner = async (
  partnerId: string,
  prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> => {
  const parsedId = cuidSchema.safeParse(partnerId);
  if (!parsedId.success) {
    return { message: "Invalid partner ID format." };
  }

  const raw = Object.fromEntries(formData.entries());
  const validatedFields = PartnerFormSchema.safeParse({
    ...raw,
    isActive: formData.get("isActive") !== null,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update partner.",
    };
  }

  const {
    name,
    type,
    email,
    phone,
    website,
    address,
    city,
    state,
    zipCode,
    isActive,
    notes,
  } = validatedFields.data;

  try {
    await prisma.partner.update({
      where: { id: parsedId.data },
      data: {
        name,
        type,
        email: email || null,
        phone: phone || null,
        website: website || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        isActive: isActive ?? true,
        notes: notes || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          errors: { name: ["A partner with this name already exists."] },
          message: "Failed to update partner.",
        };
      }
      if (error.code === "P2025") {
        return { message: "Partner not found." };
      }
    }
    console.error("Database Error updating partner:", error);
    return {
      success: false,
      message: "Database Error: Failed to update partner.",
    };
  }

  revalidatePath("/dashboard/partners-directory");
  revalidatePath(`/dashboard/partners-directory/${parsedId.data}`);

  const returnTo = formData.get("returnTo");
  redirect(
    typeof returnTo === "string" && returnTo
      ? returnTo
      : `/dashboard/partners-directory/${parsedId.data}`,
  );
};

export const createPartner = RequirePermission(AppPermissions.PARTNERS_MANAGE)(
  _createPartner,
);

export const updatePartner = RequirePermission(AppPermissions.PARTNERS_MANAGE)(
  _updatePartner,
);