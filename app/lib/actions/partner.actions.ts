"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  PartnerFormSchema,
  type PartnerFormInput,
} from "../zod-schemas/partners-directory.schemas";
import {
  PARTNER_NAME_TAKEN,
  partnerNameRefusal,
} from "@/app/lib/services/partner-name";
import { safeInternalPath } from "../utils/safe-redirect";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

const PARTNERS_DIRECTORY_PATH = "/dashboard/partners-directory";

const partnerPath = (partnerId: string) =>
  `${PARTNERS_DIRECTORY_PATH}/${partnerId}`;

// Single mapper for both actions. `isActive` arrives as a real boolean now
// rather than the checkbox's "on"/absent, but it is still optional in the
// schema, so a payload that omits it defaults to active.
const toPartnerData = (values: PartnerFormInput) => ({
  name: values.name,
  type: values.type,
  email: values.email || null,
  phone: values.phone || null,
  website: values.website || null,
  address: values.address || null,
  city: values.city || null,
  state: values.state || null,
  zipCode: values.zipCode || null,
  isActive: values.isActive ?? true,
  notes: values.notes || null,
});

const _createPartner = async (
  returnTo: string | null,
  values: PartnerFormInput,
): Promise<FormResult<PartnerFormInput>> => {
  const validatedFields = PartnerFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create partner.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PartnerFormInput>,
    };
  }

  let newPartnerId: string;

  try {
    // The unique index only catches an exact match; this catches the capitals.
    const refusal = await partnerNameRefusal(prisma, validatedFields.data.name);
    if (refusal) {
      return {
        ok: false,
        message: "Failed to create partner.",
        fieldErrors: { name: [refusal] },
      };
    }

    const partner = await prisma.partner.create({
      data: toPartnerData(validatedFields.data),
    });
    newPartnerId = partner.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "Failed to create partner.",
        fieldErrors: { name: [PARTNER_NAME_TAKEN] },
      };
    }
    console.error("Database Error creating partner:", error);
    return {
      ok: false,
      message: "Database Error: Failed to create partner.",
    };
  }

  revalidatePath(PARTNERS_DIRECTORY_PATH);

  // Behavior change, intended: create used to ignore returnTo and always land
  // on the new partner, even though the form has been sending it. Now it
  // honors it, matching update and matching createPerson.
  return {
    ok: true,
    message: "Partner created successfully.",
    redirectTo: safeInternalPath(returnTo, partnerPath(newPartnerId)),
  };
};

const _updatePartner = async (
  partnerId: string,
  returnTo: string | null,
  values: PartnerFormInput,
): Promise<FormResult<PartnerFormInput>> => {
  const parsedId = cuidSchema.safeParse(partnerId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid partner ID format." };
  }

  const validatedFields = PartnerFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update partner.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PartnerFormInput>,
    };
  }

  try {
    const stored = await prisma.partner.findUnique({
      where: { id: parsedId.data },
      select: { id: true, name: true },
    });
    if (!stored) return { ok: false, message: "Partner not found." };

    // Only a changed name is checked, so editing another field of a partner
    // whose case-variant twin already exists is not refused.
    const refusal = await partnerNameRefusal(
      prisma,
      validatedFields.data.name,
      stored,
    );
    if (refusal) {
      return {
        ok: false,
        message: "Failed to update partner.",
        fieldErrors: { name: [refusal] },
      };
    }

    await prisma.partner.update({
      where: { id: parsedId.data },
      data: toPartnerData(validatedFields.data),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          ok: false,
          message: "Failed to update partner.",
          fieldErrors: { name: [PARTNER_NAME_TAKEN] },
        };
      }
      if (error.code === "P2025") {
        return { ok: false, message: "Partner not found." };
      }
    }
    console.error("Database Error updating partner:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update partner.",
    };
  }

  revalidatePath(PARTNERS_DIRECTORY_PATH);
  revalidatePath(partnerPath(parsedId.data));

  return {
    ok: true,
    message: "Partner updated successfully.",
    redirectTo: safeInternalPath(returnTo, partnerPath(parsedId.data)),
  };
};

export const createPartner = RequirePermission(AppPermissions.PARTNERS_MANAGE)(
  _createPartner,
);

export const updatePartner = RequirePermission(AppPermissions.PARTNERS_MANAGE)(
  _updatePartner,
);