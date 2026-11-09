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
  DoseTimesFormSchema,
  type DoseTimesFormInput,
} from "../zod-schemas/dose-times.schemas";
import { updateDoseSlotEnds } from "../services/shelter-dose-times";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import { fieldErrorsByPath } from "../utils/form-result-utils";

type DoseTimesResult = FormResult<DoseTimesFormInput>;

const _updateDoseTimes = async (
  _user: SessionUser,
  values: DoseTimesFormInput,
): Promise<DoseTimesResult> => {
  const validated = DoseTimesFormSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to save the dose times.",
      fieldErrors: fieldErrorsByPath<DoseTimesFormInput>(validated.error.issues),
    };
  }

  try {
    await prisma.$transaction((tx) => updateDoseSlotEnds(tx, validated.data));
  } catch (error) {
    if (error instanceof MedicalEntryRefusal) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: error.field
          ? ({ [error.field]: [error.message] } as FieldErrors<DoseTimesFormInput>)
          : undefined,
      };
    }
    console.error("Database Error saving dose times:", error);
    return { ok: false, message: "Database Error: Failed to save the dose times." };
  }

  // Both pages read the session, so they render per request; revalidating
  // them also drops any copy the router holds.
  revalidatePath("/dashboard/settings/medical/dose-times");
  revalidatePath("/dashboard/medical/doses");
  return { ok: true, message: "Dose times saved." };
};

export const updateDoseTimes = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_updateDoseTimes),
);
