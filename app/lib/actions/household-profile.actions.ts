"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  HouseholdFieldsInput,
  HouseholdFieldsSchema,
  toHouseholdData,
} from "../zod-schemas/household-profile.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type HouseholdResult = FormResult<HouseholdFieldsInput>;

// Values arrive as a typed object rather than FormData. The client already
// holds validated values; hand-serializing them to FormData only to run
// Object.fromEntries on the other side was two lossy string conversions for
// no benefit, since none of these forms use native <form action> submission.
//
// Server-side validation is unchanged and non-negotiable: server actions are
// reachable by direct POST, so this must never trust its input.
const _updateMyHouseholdProfile = async (
  user: SessionUser,
  values: HouseholdFieldsInput,
): Promise<HouseholdResult> => {
  const personId = user.personId;

  const validatedFields = HouseholdFieldsSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update household profile.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<HouseholdFieldsInput>,
    };
  }

  const dataToSave = toHouseholdData(validatedFields.data);

  try {
    await prisma.householdProfile.upsert({
      where: { personId },
      create: { personId, ...dataToSave },
      update: dataToSave,
    });
  } catch (error) {
    console.error("Database Error updating household profile:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update household profile.",
    };
  }

  revalidatePath("/dashboard/account");
  return { ok: true, message: "Household information updated successfully." };
};

export const updateMyHouseholdProfile = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_PROFILE_UPDATE)(_updateMyHouseholdProfile),
);

const _updateStaffHouseholdProfile = async (
  personId: string,
  values: HouseholdFieldsInput,
): Promise<HouseholdResult> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid person ID format." };
  }

  const person = await prisma.person.findUnique({
    where: { id: parsedId.data },
    select: { user: { select: { id: true } } },
  });

  if (!person) {
    return { ok: false, message: "Person not found." };
  }

  if (person.user !== null) {
    return {
      ok: false,
      message:
        "Unauthorized: Cannot edit household profile for a registered user account.",
    };
  }

  const validatedFields = HouseholdFieldsSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update household profile.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<HouseholdFieldsInput>,
    };
  }

  const dataToSave = toHouseholdData(validatedFields.data);

  try {
    await prisma.householdProfile.upsert({
      where: { personId: parsedId.data },
      create: { personId: parsedId.data, ...dataToSave },
      update: dataToSave,
    });
  } catch (error) {
    console.error("Database Error updating staff household profile:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update household profile.",
    };
  }

  revalidatePath(`/dashboard/people-directory/${parsedId.data}/profile`);
  return { ok: true, message: "Household profile updated." };
};

export const updateStaffHouseholdProfile = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_updateStaffHouseholdProfile);