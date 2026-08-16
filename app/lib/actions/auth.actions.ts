"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { SignInFormSchema } from "../zod-schemas/common.schemas";
import { z } from "zod";

export interface SignInFormState {
  success?: boolean;
  message?: string | null;
  errors?: {
    email?: string[];
    password?: string[];
  };
}

export const signInWithCredentials = async (
  _prevState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> => {
  const validatedFields = SignInFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      success: false,
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Please check the form for errors.",
    };
  }

  const { email, password } = validatedFields.data;
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return { success: false, message: "Invalid email or password." };
    }
    throw error;
  }

  return { success: true };
};
