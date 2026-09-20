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
import {
  findEmailConflict,
  syncPersonToUser,
} from "../services/user-person-sync";

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
  phone: string | null;
  email: string | null;
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

  const emailMatches =
    Boolean(values.email && duplicate.email?.toLowerCase() === values.email.toLowerCase());
  const normalizedInputPhone = normalizePhone(values.phone);
  const normalizedDuplicatePhone = normalizePhone(duplicate.phone);
  const phoneMatches =
    Boolean(normalizedInputPhone && normalizedInputPhone === normalizedDuplicatePhone);

  const matchedOn: "email" | "phone" = emailMatches
    ? "email"
    : phoneMatches
      ? "phone"
      : "phone";

  return {
    ok: false,
    reason: "duplicate",
    // The form renders this as an inline Alert with its own copy, so this
    // message is only reached by a caller that hasn't handled the branch.
    message: `A person with this ${matchedOn} already exists.`,
    duplicate: {
      id: duplicate.id,
      name: duplicate.name,
      matchedOn,
      phone: duplicate.phone,
      email: duplicate.email,
    },
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

  // The email of record is also the address the account signs in under, so for
  // a person who has one this field is not staff's to move. Credential users
  // authenticate by that address and there is no self-serve sign-up or
  // password reset to recover through, so a staff edit here is a lockout, not
  // an inconvenience. The person changes it from their own profile.
  //
  // Only the email, and this is the whole of what an account withholds from
  // staff anywhere in the app: the application snapshot and the household
  // profile stay staff-writable for a registered person, recorded rather than
  // refused. The line is around the credentials, not around the existence of
  // an account — a record staff may not touch is a record nobody can correct
  // once its owner cannot reach it. When the account turns out to belong to a
  // different human altogether, `unlinkPersonAccount` separates the two.
  let existingPerson;
  try {
    existingPerson = await prisma.person.findUnique({
      where: { id: parsedId.data },
      select: { email: true, user: { select: { id: true } } },
    });
  } catch (error) {
    console.error("Database Error reading person before update:", error);
    return { ok: false, message: "Database Error: Failed to update person." };
  }
  if (!existingPerson) {
    return { ok: false, message: "Person not found." };
  }

  // Stored addresses are always lowercase (the normalization extension), so
  // this compares addresses rather than how they were typed.
  const requestedEmail = validatedFields.data.email?.trim().toLowerCase() || null;
  if (existingPerson.user && requestedEmail !== existingPerson.email) {
    return {
      ok: false,
      message: "Failed to update person.",
      fieldErrors: {
        email: [
          "This person has an account and signs in with this address. They can change it from their own profile.",
        ],
      },
    };
  }

  // `findDuplicate` only ever looks at `Person`, and this action now moves the
  // login address too. An address can sit on a `User` and on no `Person` — a
  // cleared person email leaves one behind, and rows written before there was
  // a single writer drifted on their own — in which case the write below fails
  // on `users.email` and the directory holds nobody to point the editor at.
  // Named here so the message says where the address actually is.
  if (
    (await findEmailConflict(prisma, validatedFields.data.email, parsedId.data)) ===
    "user"
  ) {
    return {
      ok: false,
      message: "Failed to update person.",
      fieldErrors: {
        email: ["This email is already the sign-in address for another account."],
      },
    };
  }

  try {
    // One transaction, so the two rows cannot end up disagreeing because the
    // second write failed. A duplicate email fails whichever statement reaches
    // it first — `Person.email` and `User.email` are both unique — and either
    // way the whole thing rolls back. The check above names the common case;
    // this one is the race that slipped between it and the write, so it says
    // only what it can still be sure of.
    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: parsedId.data },
        data: toPersonData(validatedFields.data),
      });
      await syncPersonToUser(tx, parsedId.data, validatedFields.data);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "Failed to update person.",
        fieldErrors: { email: ["This email is already in use."] },
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

  // Both tables are asked, because this writes to both and either unique index
  // can be the one that refuses. Saying which it is keeps the message useful:
  // "no such person" is what someone sees when they go looking for a shelter
  // record that holds an address only an account holds.
  const conflict = await findEmailConflict(
    prisma,
    validatedFields.data.email,
    personId,
  );
  if (conflict) {
    return {
      ok: false,
      message: "Failed to update profile.",
      fieldErrors: {
        email: [
          conflict === "person"
            ? "A person with this email already exists."
            : "This email is already the sign-in address for another account.",
        ],
      },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: toPersonData(validatedFields.data),
      });
      // Always a no-op-or-one-row here: this action only runs for a signed-in
      // person, so the account exists. Shared with the staff path anyway, so
      // there is one writer rather than two that can drift.
      await syncPersonToUser(tx, personId, validatedFields.data);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        // The pre-check above covers the ordinary case; reaching here means
        // the address was claimed in between, so this says only that much.
        return {
          ok: false,
          message: "Failed to update profile.",
          fieldErrors: { email: ["This email is already in use."] },
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
