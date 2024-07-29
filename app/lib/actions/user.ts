"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/app/lib/prisma";
import { rolesWithPermission } from "@/app/lib/actions/authorization";
import { idSchema } from "@/app/lib/schemas/common";
import { z } from "zod";

// error messages for the user form
export type CreateUserFormState = {
  errors?: {
    role?: string[];
  };
  message?: string | null;
};

// Define a schema for the user form
export const UserFormSchema = z.object({
  role: z.enum(["user", "employee"], {
    invalid_type_error: "Please select a role.",
  }),
});

export async function deleteUser(id: string) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Delete User.");
  }

  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error();
  }

  // Delete the user
  try {
    await prisma.user.delete({
      where: { id: id },
    });

    // Revalidate the cache
    revalidatePath("/dashboard/users");

  } catch (error) {
    return {
      message: "Database Error: Failed to delete user.",
    };
  }
}

export async function updateUser(
  id: string,
  prevState: CreateUserFormState,
  formData: FormData
) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Update User.");
  }

  // Validate the id at runtime using Zod
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error();
  }

  // Validate the form data using Zod
  const validatedFields = UserFormSchema.safeParse({
    role: formData.get("role"),
  });
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Update User.",
    };
  }

  // Prepare data for insertion into the database
  const { role } = validatedFields.data;

  // Update the user in the database
  try {
    await prisma.user.update({
      where: { id: id },
      data: {
        role: role,
      },
    });
  } catch (error) {
    return {
      message: "Database Error: Failed to Update User.",
    };
  }

  // Revalidate the cache
  revalidatePath("/dashboard/users");
  
  // Redirect to the users page
  redirect("/dashboard/users");
}
