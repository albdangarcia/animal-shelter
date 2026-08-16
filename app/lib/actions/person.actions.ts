"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { PersonFormState } from "../form-state-types";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  PersonFormSchema,
  StaffPersonFormSchema,
} from "../zod-schemas/people-directory.schemas";
import { fetchDuplicatePersonCandidate } from "../data/people-directory/people-directory.data";
import { z } from "zod";

const _createPerson = async (
  prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> => {
  const validatedFields = StaffPersonFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create person.",
    };
  }

  const { name, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  const returnTo = formData.get("returnTo");
  const resolvedReturnTo =
    typeof returnTo === "string" && returnTo ? returnTo : null;

  // Soft duplicate warning: keyed on the contact method alone, never on
  // name. Skipped when the user has already confirmed they want to proceed.
  const confirmDuplicate = formData.get("confirmDuplicate") === "true";
  if (!confirmDuplicate) {
    const duplicate = await fetchDuplicatePersonCandidate(
      email || null,
      phone || null,
    );
    if (duplicate) {
      const matchedOn: "email" | "phone" =
        email && duplicate.email?.toLowerCase() === email.toLowerCase()
          ? "email"
          : "phone";
      return {
        duplicate: { id: duplicate.id, name: duplicate.name, matchedOn },
      };
    }
  }

  let newPersonId: string;

  try {
    const person = await prisma.person.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
      },
    });
    newPersonId = person.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { email: ["A person with this email already exists."] },
        message: "Failed to create person.",
      };
    }
    console.error("Database Error creating person:", error);
    return {
      success: false,
      message: "Database Error: Failed to create person.",
    };
  }

  revalidatePath("/dashboard/people-directory");
  redirect(resolvedReturnTo ?? `/dashboard/people-directory/${newPersonId}`);
};

const _updatePerson = async (
  personId: string,
  prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    return { message: "Invalid person ID format." };
  }

  const validatedFields = StaffPersonFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update person.",
    };
  }

  const { name, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  // Soft duplicate warning, same as create: keyed on email/phone, never
  // name. excludePersonId is critical here — without it, this person would
  // always "match" themselves on their own unchanged email/phone.
  const confirmDuplicate = formData.get("confirmDuplicate") === "true";
  if (!confirmDuplicate) {
    const duplicate = await fetchDuplicatePersonCandidate(
      email || null,
      phone || null,
      parsedId.data,
    );
    if (duplicate) {
      const matchedOn: "email" | "phone" =
        email && duplicate.email?.toLowerCase() === email.toLowerCase()
          ? "email"
          : "phone";
      return {
        duplicate: { id: duplicate.id, name: duplicate.name, matchedOn },
      };
    }
  }

  try {
    await prisma.person.update({
      where: { id: parsedId.data },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { email: ["A person with this email already exists."] },
        message: "Failed to update person.",
      };
    }
    console.error("Database Error updating person:", error);
    return {
      success: false,
      message: "Database Error: Failed to update person.",
    };
  }

  revalidatePath("/dashboard/people-directory");
  revalidatePath(`/dashboard/people-directory/${parsedId.data}`);

  const returnTo = formData.get("returnTo");
  redirect(
    typeof returnTo === "string" && returnTo
      ? returnTo
      : `/dashboard/people-directory/${parsedId.data}`,
  );
};

const _updateMyProfile = async (
  user: SessionUser,
  prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> => {
  const personId = user.personId;

  const validatedFields = PersonFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update profile.",
    };
  }

  const { name, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  try {
    await prisma.person.update({
      where: { id: personId },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          errors: { email: ["A person with this email already exists."] },
          message: "Failed to update profile.",
        };
      }
      if (error.code === "P2025") {
        return { message: "Profile not found." };
      }
    }
    console.error("Database Error updating profile:", error);
    return {
      success: false,
      message: "Database Error: Failed to update profile.",
    };
  }

  revalidatePath("/dashboard/account");
  return { success: true, message: "Profile updated successfully." };
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
