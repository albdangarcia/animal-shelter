"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  PersonFormSchema,
  StaffPersonFormSchema,
  type PersonFormInput,
} from "../zod-schemas/people-directory.schemas";
import type { PersonPickerOption } from "../types";
import { fetchDuplicatePersonCandidate } from "../data/people-directory/people-directory.data";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import { safeInternalPath } from "../utils/safe-redirect";
import { normalizePhone } from "../utils/phone";

const PEOPLE_DIRECTORY_PATH = "/dashboard/people-directory";

const personPath = (personId: string) => `${PEOPLE_DIRECTORY_PATH}/${personId}`;

// A duplicate candidate is neither variant of FormResult: nothing was written,
// so it isn't a success, and the input may be perfectly valid, so it isn't a
// field error either. Rather than widen the shared union for one form, this
// file adds a third member tagged by `reason`. `ok` stays strictly boolean, so
// the canonical `if (result.ok)` handler can never mistake a duplicate for a
// success — and a caller that forgets the branch falls through to
// "toast the message", not to a silent no-op.
export type DuplicateCandidate = {
  id: string;
  name: string;
  matchedOn: "email" | "phone";
};

export type PersonDuplicateWarning = {
  ok: false;
  reason: "duplicate";
  message: string;
  duplicate: DuplicateCandidate;
};

export type PersonActionResult =
  | FormResult<PersonFormInput>
  | PersonDuplicateWarning;

// The create dialog needs the newly created row, but the shared FormResult
// cannot be widened because other actions use it. Keep this success payload
// local to the create action instead.
type CreatePersonResult =
  | Extract<FormResult<PersonFormInput>, { ok: false }>
  | (Extract<FormResult<PersonFormInput>, { ok: true }> & {
      person: PersonPickerOption;
    })
  | PersonDuplicateWarning;

// Single mapper for all three actions: the nullable Person columns must be
// written as NULL rather than "" when an input is cleared.
const toPersonData = (values: PersonFormInput) => ({
  name: values.name,
  email: values.email || null,
  phone: values.phone || null,
  phoneNormalized: normalizePhone(values.phone),
  address: values.address || null,
  city: values.city || null,
  state: values.state || null,
  zipCode: values.zipCode || null,
});

// Soft duplicate warning: keyed on the contact method alone, never on name.
// `excludePersonId` is critical on update — without it a person always
// "matches" themselves on their own unchanged email/phone.
const findDuplicate = async (
  values: PersonFormInput,
  excludePersonId?: string,
): Promise<PersonDuplicateWarning | null> => {
  const duplicate = await fetchDuplicatePersonCandidate(
    values.email || null,
    values.phone || null,
    excludePersonId,
  );

  if (!duplicate) return null;

  const matchedOn: "email" | "phone" =
    values.email && duplicate.email?.toLowerCase() === values.email.toLowerCase()
      ? "email"
      : "phone";

  return {
    ok: false,
    reason: "duplicate",
    // The form renders this as an inline Alert with its own copy, so this
    // message is only reached by a caller that hasn't handled the branch.
    message: `A person with this ${matchedOn} already exists.`,
    duplicate: { id: duplicate.id, name: duplicate.name, matchedOn },
  };
};

const _createPerson = async (
  returnTo: string | null,
  confirmDuplicate: boolean,
  values: PersonFormInput,
): Promise<CreatePersonResult> => {
  const validatedFields = StaffPersonFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create person.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PersonFormInput>,
    };
  }

  if (!confirmDuplicate) {
    const duplicate = await findDuplicate(validatedFields.data);
    if (duplicate) return duplicate;
  }

  let person: PersonPickerOption;

  try {
    person = await prisma.person.create({
      data: toPersonData(validatedFields.data),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "Failed to create person.",
        fieldErrors: { email: ["A person with this email already exists."] },
      };
    }
    console.error("Database Error creating person:", error);
    return {
      ok: false,
      message: "Database Error: Failed to create person.",
    };
  }

  revalidatePath(PEOPLE_DIRECTORY_PATH);

  return {
    ok: true,
    message: "Person created successfully.",
    person,
    // returnTo originates in the URL and is re-checked here rather than
    // trusted from the client: this action is reachable by direct POST.
    redirectTo: safeInternalPath(returnTo, personPath(person.id)),
  };
};

const _updatePerson = async (
  personId: string,
  returnTo: string | null,
  confirmDuplicate: boolean,
  values: PersonFormInput,
): Promise<PersonActionResult> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid person ID format." };
  }

  const validatedFields = StaffPersonFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update person.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PersonFormInput>,
    };
  }

  if (!confirmDuplicate) {
    const duplicate = await findDuplicate(validatedFields.data, parsedId.data);
    if (duplicate) return duplicate;
  }

  try {
    await prisma.person.update({
      where: { id: parsedId.data },
      data: toPersonData(validatedFields.data),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "Failed to update person.",
        fieldErrors: { email: ["A person with this email already exists."] },
      };
    }
    console.error("Database Error updating person:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update person.",
    };
  }

  revalidatePath(PEOPLE_DIRECTORY_PATH);
  revalidatePath(personPath(parsedId.data));

  return {
    ok: true,
    message: "Person updated successfully.",
    redirectTo: safeInternalPath(returnTo, personPath(parsedId.data)),
  };
};

const _updateMyProfile = async (
  user: SessionUser,
  values: PersonFormInput,
): Promise<FormResult<PersonFormInput>> => {
  const personId = user.personId;

  const validatedFields = PersonFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to update profile.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<PersonFormInput>,
    };
  }

  try {
    await prisma.person.update({
      where: { id: personId },
      data: toPersonData(validatedFields.data),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          ok: false,
          message: "Failed to update profile.",
          fieldErrors: { email: ["A person with this email already exists."] },
        };
      }
      if (error.code === "P2025") {
        return { ok: false, message: "Profile not found." };
      }
    }
    console.error("Database Error updating profile:", error);
    return {
      ok: false,
      message: "Database Error: Failed to update profile.",
    };
  }

  revalidatePath("/dashboard/account");
  return { ok: true, message: "Profile updated successfully." };
};

export const updateMyProfile = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_PROFILE_UPDATE)(_updateMyProfile),
);

export const createPerson = RequirePermission(AppPermissions.PERSONS_MANAGE)(
  _createPerson,
);

export const updatePerson = RequirePermission(AppPermissions.PERSONS_MANAGE)(
  _updatePerson,
);
