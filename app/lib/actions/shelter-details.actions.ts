"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  ShelterDetailsFormSchema,
  type ShelterDetailsFormInput,
} from "../zod-schemas/shelter-details.schemas";
import {
  ShelterDetailsRefusal,
  updateShelterState,
} from "../services/shelter-details";
import type { FormResult } from "@/app/lib/action-result";
import { fieldErrorsByPath } from "../utils/form-result-utils";

type ShelterDetailsResult = FormResult<ShelterDetailsFormInput>;

const _updateShelterDetails = async (
  _user: SessionUser,
  values: ShelterDetailsFormInput,
): Promise<ShelterDetailsResult> => {
  const validated = ShelterDetailsFormSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to save the shelter details.",
      fieldErrors: fieldErrorsByPath<ShelterDetailsFormInput>(validated.error.issues),
    };
  }

  try {
    await prisma.$transaction((tx) => updateShelterState(tx, validated.data.state));
  } catch (error) {
    if (error instanceof ShelterDetailsRefusal) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }
    console.error("Database Error saving shelter details:", error);
    return { ok: false, message: "Database Error: Failed to save the shelter details." };
  }

  revalidatePath("/dashboard/settings/shelter-details");
  return { ok: true, message: "Shelter details saved." };
};

export const updateShelterDetails = withAuthenticatedUser(
  RequirePermission(AppPermissions.SHELTER_DETAILS_MANAGE)(_updateShelterDetails),
);
