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
  householdEditStamp,
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

  const dataToSave = {
    ...toHouseholdData(validatedFields.data),
    ...householdEditStamp(user.personId),
  };

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
  user: SessionUser,
  personId: string,
  values: HouseholdFieldsInput,
): Promise<HouseholdResult> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid person ID format." };
  }

  // No account check. Whether this person can sign in says nothing about
  // whether the shelter may keep its own record of their household — and the
  // person who most needs staff to write it down is the one standing at the
  // desk who cannot reach their account. What an account does own is its
  // credentials, which live on `User` and are not writable from here.
  const person = await prisma.person.findUnique({
    where: { id: parsedId.data },
    select: { id: true },
  });

  if (!person) {
    return { ok: false, message: "Person not found." };
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

  // Recorded rather than refused: the profile may belong to someone with an
  // account, and staff reading it later can tell it was staff, not the owner,
  // who last wrote it.
  const dataToSave = {
    ...toHouseholdData(validatedFields.data),
    ...householdEditStamp(user.personId),
  };

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

  revalidatePath(`/dashboard/people-directory/${parsedId.data}`);
  return {
    ok: true,
    message: "Household profile updated.",
    redirectTo: `/dashboard/people-directory/${parsedId.data}`,
  };
};

export const updateStaffHouseholdProfile = withAuthenticatedUser(
  RequirePermission(AppPermissions.PERSONS_MANAGE)(_updateStaffHouseholdProfile),
);