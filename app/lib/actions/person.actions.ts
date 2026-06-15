"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { PersonFormState } from "../form-state-types";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { PersonFormSchema } from "../zod-schemas/people-directory.schemas";

const _createPerson = async (
  prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> => {
  const validatedFields = PersonFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to create person.",
    };
  }

  const { name, type, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  let newPersonId: string;

  try {
    const person = await prisma.person.create({
      data: {
        name,
        type,
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
  redirect(`/dashboard/people-directory/${newPersonId}`);
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

  const validatedFields = PersonFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to update person.",
    };
  }

  const { name, type, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  try {
    await prisma.person.update({
      where: { id: parsedId.data },
      data: {
        name,
        type,
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
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to update profile.",
    };
  }

  const { name, email, phone, address, city, state, zipCode } =
    validatedFields.data;

  try {
    // Look up the existing `type` so self-service edits can never change it,
    // regardless of what the (hidden/unused) field in the submitted form contains.
    const existingPerson = await prisma.person.findUnique({
      where: { id: personId },
      select: { type: true },
    });

    if (!existingPerson) {
      return { message: "Profile not found." };
    }

    await prisma.person.update({
      where: { id: personId },
      data: {
        name,
        type: existingPerson.type, // preserved, not user-editable
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
        message: "Failed to update profile.",
      };
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
  RequirePermission(Permissions.MY_PROFILE_UPDATE)(_updateMyProfile),
);

export const createPerson = RequirePermission(Permissions.PERSONS_MANAGE)(
  _createPerson,
);

export const updatePerson = RequirePermission(Permissions.PERSONS_MANAGE)(
  _updatePerson,
);
